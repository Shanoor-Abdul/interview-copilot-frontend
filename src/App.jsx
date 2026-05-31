import { useState, useRef, useEffect } from "react";

export default function App() {
  const [recording, setRecording] = useState(false);
  const [history, setHistory] = useState([]);
  const [currentQ, setCurrentQ] = useState(null);
  const [currentA, setCurrentA] = useState(null);
  const [error, setError] = useState(null);
  
  const pendingQuestion = useRef(null);
  const portRef = useRef(null);
  const audioCtx = useRef(null);
  const processor = useRef(null);
  const stream = useRef(null);
  const historyEndRef = useRef(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  useEffect(() => () => stop(), []);

  useEffect(() => {
    const setupPort = () => {
      const port = chrome.runtime.connect({ name: 'interview-copilot' });
      portRef.current = port;
      
      port.onMessage.addListener((msg) => {
        console.log('Popup received:', msg);
        
        if (msg.type === 'CONNECTED') {
          console.log('Connected to backend');
        } else if (msg.type === 'MESSAGE') {
          handleMessage(msg.data);
        } else if (msg.type === 'ERROR') {
          setError('Connection error: ' + msg.error);
          stop();
        } else if (msg.type === 'DISCONNECTED') {
          setRecording(false);
        }
      });
      
      port.onDisconnect.addListener(() => {
        console.log('Port disconnected');
        portRef.current = null;
      });
    };
    
    setupPort();
    
    return () => {
      portRef.current?.disconnect();
    };
  }, []);

  const handleMessage = (data) => {
    if (data.startsWith('Q:')) {
      const q = data.slice(2);
      pendingQuestion.current = q;
      setCurrentQ(q);
      setCurrentA(null);
    } else if (data.startsWith('A:')) {
      const a = data.slice(2);
      setCurrentA(a);
      
      const questionToStore = pendingQuestion.current || currentQ || "Unknown";
      
      setHistory(prev => {
        const isDuplicate = prev.some(h => 
          h.question === questionToStore && h.answer === a
        );
        if (!isDuplicate) {
          return [...prev, {
            question: questionToStore,
            answer: a,
            time: Date.now()
          }];
        }
        return prev;
      });
      
      pendingQuestion.current = null;
    } else if (data.startsWith('ERROR:')) {
      setError(data.replace('ERROR:', ''));
    }
  };

  const stop = () => {
    processor.current?.disconnect();
    audioCtx.current?.close();
    stream.current?.getTracks().forEach(t => t.stop());
    portRef.current?.postMessage({ type: 'DISCONNECT' });
    processor.current = null;
    audioCtx.current = null;
    stream.current = null;
    pendingQuestion.current = null;
    setRecording(false);
  };

 const start = async () => {
  setError(null);
  pendingQuestion.current = null;
  
  try {
    console.log('🎬 Start clicked');
    portRef.current?.postMessage({ type: 'CONNECT' });
    
    // Get TAB audio (not microphone) - important for interviews
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: true,  // Enable for cleaner audio
        noiseSuppression: true,   // Enable for cleaner audio
        autoGainControl: true,    // Enable for consistent volume
        sampleRate: 16000,        // Match backend expectation
        channelCount: 1           // Mono is fine for speech
      }
    });
    
    if (s.getAudioTracks().length === 0) {
      throw new Error('No audio! Check "Share audio" checkbox');
    }
    
    stream.current = s;
    
    // Use lower sample rate for speech recognition
    const ctx = new AudioContext({ sampleRate: 16000 });
    audioCtx.current = ctx;
    
    const src = ctx.createMediaStreamSource(s);
    
    // Add a low-pass filter to reduce high-frequency noise
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4000; // Voice is mostly below 4kHz
    
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    
    proc.onaudioprocess = (e) => {
      if (!portRef.current) return;
      
      const input = e.inputBuffer.getChannelData(0);
      
      // Simple noise gate - ignore very quiet audio
      const maxAmp = Math.max(...input.map(Math.abs));
      if (maxAmp < 0.01) {
        return; // Too quiet, skip
      }
      
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      
      // Send as array
      portRef.current.postMessage({ 
        type: 'AUDIO', 
        data: Array.from(pcm)
      });
    };
    
    src.connect(filter);
    filter.connect(proc);
    proc.connect(ctx.destination);
    processor.current = proc;
    
    s.getTracks().forEach(t => t.onended = stop);
    setRecording(true);
    
  } catch (e) {
    console.error('Start error:', e);
    setError(e.message || 'Failed');
    stop();
  }
};

  return (
    <div className="w-[700px] h-[500px] flex flex-col bg-white font-sans">
      <div className="bg-gray-800 text-white px-4 py-3 flex justify-between items-center">
        <span className="font-bold text-base">Interview Copilot</span>
        <span className="text-xs text-gray-400">
          {history.length} questions
        </span>
      </div>
      
      <div className="px-4 py-3 bg-gray-100 border-b flex gap-3 items-center">
        <button
          onClick={recording ? stop : start}
          className={`px-6 py-2 rounded-md font-bold text-sm text-white transition-colors ${
            recording ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
          }`}
        >
          {recording ? '⏹ Stop' : '▶️ Start'}
        </button>
        
        <span className="text-sm text-gray-600">
          {recording ? 'Listening...' : 'Click Start to begin'}
        </span>
        
        {error && (
          <span className="ml-auto text-red-600 text-xs">
            {error}
          </span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[55%] p-4 border-r bg-gray-50 flex flex-col gap-3 overflow-y-auto">
          <div className="text-xs font-bold text-gray-500 uppercase">
            Current Interview
          </div>

          {(currentQ || pendingQuestion.current) ? (
            <div className="p-4 bg-blue-100 rounded-lg border-2 border-blue-500">
              <div className="text-xs font-bold text-blue-800 uppercase mb-2 flex items-center gap-1">
                🎤 Interviewer Asked
              </div>
              <div className="text-blue-900 text-base font-medium leading-relaxed">
                {currentQ || pendingQuestion.current}
              </div>
            </div>
          ) : (
            <div className="p-10 bg-gray-100 rounded-lg text-center text-gray-400">
              <div className="text-sm mb-2">No question detected yet</div>
              <div className="text-xs">Start assistant and speak clearly</div>
            </div>
          )}
          
          {currentA ? (
            <div className="p-4 bg-green-100 rounded-lg border-2 border-green-500 flex-1 flex flex-col">
              <div className="text-xs font-bold text-green-800 uppercase mb-2 flex items-center gap-1">
                💡 Suggested Answer
              </div>
              <div className="text-green-900 text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto">
                {currentA}
              </div>
            </div>
          ) : (currentQ || pendingQuestion.current) ? (
            <div className="p-8 bg-yellow-100 rounded-lg text-center text-yellow-800">
              <div className="text-sm">⏳ Generating answer...</div>
            </div>
          ) : null}
        </div>

        <div className="w-[45%] p-4 flex flex-col overflow-hidden bg-white">
          <div className="text-xs font-bold text-gray-500 uppercase mb-3 flex justify-between items-center">
            <span>📚 History ({history.length})</span>
            {history.length > 0 && (
              <button 
                onClick={() => setHistory([])}
                className="text-red-600 text-xs hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto flex flex-col gap-2">
            {history.length === 0 ? (
              <div className="text-gray-400 text-sm text-center py-10">
                No history yet
              </div>
            ) : (
              <>
                {[...history].reverse().map((h, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-400 mb-1">
                      #{history.length - i} • {new Date(h.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                    <div className="font-semibold text-blue-800 text-sm mb-1">
                      Q: {h.question}
                    </div>
                    <div className="text-green-700 text-xs leading-relaxed">
                      A: {h.answer}
                    </div>
                  </div>
                ))}
                <div ref={historyEndRef} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}