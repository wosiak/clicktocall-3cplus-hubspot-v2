"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Phone, Mic, MicOff, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import JsSIP from "jssip";
import { useSocketBroadcast } from "@/hooks/use-socket-broadcast";

interface UserData {
  telephony_id: string;
  extension_password: string;
  company: {
    domain: string;
  };
}

function ExtensionContent() {
  const searchParams = useSearchParams();
  const apiToken = searchParams.get("api_token");

  const [user, setUser] = useState<UserData | null>(null);
  const [registered, setRegistered] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [label, setLabel] = useState("Inicializando...");
  const [showMessage, setShowMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    "Não foi possível conectar. Por favor, tente recarregar a página."
  );

  const uaRef = useRef<JsSIP.UA | null>(null);
  const sessionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wsAttemptsRef = useRef(0);
  const registerAttemptsRef = useRef(0);
  const lastHeartbeatRef = useRef(Date.now());
  const heartbeatCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Socket.IO broadcast hook
  const socketBroadcast = useSocketBroadcast({
    token: apiToken || "",
    handlers: {
      onHeartbeat: (data) => {
        lastHeartbeatRef.current = Date.now();
      },
      onCheckExtensionStatus: (data) => {
        socketBroadcast.respondExtensionStatus({
          isOpen: true,
          isConnected: registered,
        });
      },
      onTokenValidation: (data) => {
        const currentToken = localStorage.getItem("3c_api_token");
        const receivedToken = data.validationToken;

        if (currentToken !== receivedToken) {
          console.log("⚠️ Token diferente detectado. Fechando popup...");
          socketBroadcast.broadcastExtensionClosed({});
          window.close();
        }
      }
    }
  });

  // Initialize Socket.IO broadcast
  useEffect(() => {
    // Notify that extension opened
    socketBroadcast.broadcastExtensionOpened({
      timestamp: Date.now(),
    });

    // Send heartbeat back to tabs every 5 seconds
    const extensionHeartbeatInterval = setInterval(() => {
      socketBroadcast.sendHeartbeat();
    }, 5000);

    // Check heartbeats from tabs every 2 seconds
    heartbeatCheckIntervalRef.current = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;

      // Check if token still exists in localStorage
      const currentToken = localStorage.getItem("3c_api_token");
      if (!currentToken) {
        console.log("⚠️ Token removido do localStorage. Fechando popup...");
        socketBroadcast.broadcastExtensionClosed({});
        window.close();
        return;
      }

      if (timeSinceLastHeartbeat > 10000) {
        console.log("⚠️ Nenhuma aba ClickToCall ativa. Fechando popup...");
        socketBroadcast.broadcastExtensionClosed({});
        window.close();
      }
    }, 800);

    return () => {
      socketBroadcast.broadcastExtensionClosed({});
      clearInterval(extensionHeartbeatInterval);
      if (heartbeatCheckIntervalRef.current) {
        clearInterval(heartbeatCheckIntervalRef.current);
      }
    };
  }, [registered, socketBroadcast]);

  // Fetch user data and initialize
  useEffect(() => {
    if (!apiToken) {
      setShowMessage(true);
      setErrorMessage("Token de API não fornecido");
      return;
    }

    // Check for HTTPS (only in production)
    const isDev = process.env.NODE_ENV === "development";
    if (window.location.protocol === "http:" && !isDev) {
      setShowMessage(true);
      setErrorMessage("Esta extensão requer HTTPS");
      return;
    }

    fetchUserData();
  }, [apiToken]);

  const fetchUserData = async () => {
    if (!apiToken) return;

    try {
      const response = await fetch(
        `https://app.3c.plus/api/v1/me?api_token=${apiToken}&include=company`
      );

      if (!response.ok) {
        throw new Error("Falha ao buscar dados do usuário");
      }

      await fetch(
        `https://app.3c.plus/api/v1/agent/connect?api_token=${apiToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      const data = await response.json();
      setUser(data.data);
    } catch (error) {
      console.error("Error fetching user data:", error);
      setShowMessage(true);
      setErrorMessage("Erro ao carregar dados do usuário");
    }
  };

  // Initialize JsSIP when user data is available
  useEffect(() => {
    if (user) {
      connectJsSip();
    }

    return () => {
      if (uaRef.current) {
        uaRef.current.stop();
      }
    };
  }, [user]);

  const connectJsSip = async () => {
    if (!user) return;

    console.log("connectJsSip:", user);

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[UserMedia] Permission is granted!");
    } catch (error) {
      console.log("[UserMedia] Not allowed", error);
      setShowMessage(true);
      setErrorMessage("Permissão de microfone necessária");
      return;
    }

    const host = `${user.company.domain}.3c.fluxoti.com`;
    const socket = new JsSIP.WebSocketInterface(
      `wss://vox-socket.3c.fluxoti.com:4443`
    );

    const configuration = {
      sockets: [socket],
      uri: `sip:${user.telephony_id}@${host}`,
      password: user.extension_password,
      register: true,
      register_expires: 30,
      session_timers: false,
      connection_recovery_max_interval: 30,
      connection_recovery_min_interval: 2,
    };

    const ua = new JsSIP.UA(configuration);
    uaRef.current = ua;

    setupSipEvents(ua);
    ua.start();
  };

  const setupSipEvents = (ua: JsSIP.UA) => {
    ua.on("connected", () => {
      console.log("connected");
      wsAttemptsRef.current = 0;
    });

    ua.on("disconnected", (e) => {
      console.log("disconnected, trying reconnect...", e);
      setLabel("Desconectado, tentando conectar...");
      setShowMessage(true);
      wsAttemptsRef.current++;

      const attempts = inCall ? 10 : 5;
      if (wsAttemptsRef.current > attempts) {
        setErrorMessage(
          "Não foi possível conectar após várias tentativas. Recarregue a página."
        );
        ua.stop();
      }
    });

    ua.on("registered", () => {
      console.log("registered");
      setLabel("Ramal registrado");
      setRegistered(true);
      setShowMessage(false);
      wsAttemptsRef.current = 0;
      registerAttemptsRef.current = 0;

      // Notify connection success via Socket.IO
      socketBroadcast.broadcastExtensionConnected({
        token: apiToken,
      });
    });

    ua.on("unregistered", () => {
      console.log("unregistered");
      setLabel("Ramal desconectado, tentando conectar...");
      setRegistered(false);
      setShowMessage(false);
    });

    ua.on("registrationFailed", (e) => {
      console.log("registrationFailed", e);
      setLabel("Tentando registrar...");
      setRegistered(false);
      setShowMessage(true);

      setTimeout(() => {
        if (ua.isConnected() && !ua.isRegistered()) {
          if (registerAttemptsRef.current <= 10) {
            console.log("trying register...");
            setLabel("Tentando registrar...");
            ua.register();
            registerAttemptsRef.current++;
          } else {
            console.log("Register 10 attempts");
            setErrorMessage("Falha ao registrar após várias tentativas");
          }
        }
      }, 5000);
    });

    ua.on("newRTCSession", (data: any) => {
      console.log("newRTCSession:", data);
      const session = data.session;
      sessionRef.current = session;

      session.on("accepted", () => {
        console.log("call accepted");
        setInCall(true);
      });

      session.on("peerconnection", (data: any) => {
        data.peerconnection.addEventListener("addstream", (event: any) => {
          if (audioRef.current) {
            audioRef.current.srcObject = event.stream;
            audioRef.current.play();
          }
        });
      });

      session.on("getusermediafailed", (e: any) => {
        console.log("getusermediafailed:", e);
        setShowMessage(true);
        setErrorMessage("Falha ao acessar o microfone");
      });

      session.on("ended", () => {
        console.log("call ended");
        sessionRef.current = null;
        setInCall(false);
        setMuted(false);
      });

      session.on("failed", () => {
        console.log("call failed");
        sessionRef.current = null;
        setInCall(false);
        setMuted(false);
      });

      // Answer the call
      session.answer({
        mediaConstraints: {
          audio: true,
          video: false,
        },
      });
    });
  };

  const muteMicrophone = () => {
    if (inCall && sessionRef.current) {
      if (muted) {
        sessionRef.current.unmute();
        setMuted(false);
        // Broadcast unmute to ClickToCall tabs via Socket.IO
        socketBroadcast.broadcastMicrophoneUnmuted({
          timestamp: Date.now(),
        });
      } else {
        sessionRef.current.mute();
        setMuted(true);
        // Broadcast mute to ClickToCall tabs via Socket.IO
        socketBroadcast.broadcastMicrophoneMuted({
          timestamp: Date.now(),
        });
      }
    }
  };

  const handleReload = () => {
    if (window.location.protocol !== "https:") {
      window.location.href =
        "https:" +
        window.location.href.substring(window.location.protocol.length);
      return;
    }
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#ebe1e4] p-4">
      <div className="w-full max-w-md space-y-4">
        {showMessage && (
          <Card>
            <CardContent className="pt-6">
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
              <Button
                onClick={handleReload}
                variant="outline"
                className="w-full mt-4 gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Recarregar
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                  inCall
                    ? "bg-green-500 text-white animate-pulse"
                    : registered
                    ? "bg-gray-200"
                    : "bg-gray-200"
                }`}
              >
                <Phone
                  className={`h-5 w-5 ${
                    !registered && !inCall ? "animate-pulse" : ""
                  }`}
                />
              </div>

              <span className="flex-1 font-medium">
                {inCall ? "Conectado à campanha" : label}
              </span>

              {registered && inCall && (
                <Button
                  onClick={muteMicrophone}
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                >
                  {muted ? (
                    <MicOff className="h-5 w-5 text-red-500" />
                  ) : (
                    <Mic className="h-5 w-5 text-green-500" />
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <audio ref={audioRef} autoPlay className="hidden" />
    </div>
  );
}

export default function ExtensionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#ebe1e4]">
          <div className="text-center">
            <p className="text-lg">Carregando...</p>
          </div>
        </div>
      }
    >
      <ExtensionContent />
    </Suspense>
  );
}
