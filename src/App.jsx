import { useState, useRef, useEffect } from "react";

export default function App() {
  const [recording, setRecording] = useState(false);
  const [history, setHistory] = useState([]);
  const [currentQ, setCurrentQ] = useState(null);
  const [currentA, setCurrentA] = useState(null);
  const [error, setError] = useState(null);
  
  const pendingQuestion = useRef(null);
  const ws = useRef(null);
  const audioCtx = useRef(null);
  const processor = useRef(null);
  const stream = useRef(null);
  const historyEndRef = useRef(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  useEffect(() => () => stop(), []);

  const stop = () => {
    processor.current?.disconnect();
    audioCtx.current?.close();
    stream.current?.getTracks().forEach(t => t.stop());
    ws.current?.close();
    processor.current = null;
    audioCtx.current = null;
    stream.current = null;
    ws.current = null;
    pendingQuestion.current = null;
    setRecording(false);
  };

  const start = async () => {
    setError(null);
    pendingQuestion.current = null;
    
    try {
      const socket = new WebSocket('ws://localhost:8000/ws');
      
      socket.onmessage = (e) => {
        const d = e.data;
        
        if (d.startsWith('Q:')) {
          const q = d.slice(2);
          pendingQuestion.current = q;
          setCurrentQ(q);
          setCurrentA(null);
        } 
        else if (d.startsWith('A:')) {
          const a = d.slice(2);
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
        } 
        else if (d.startsWith('ERROR:')) {
          setError(d.replace('ERROR:', ''));
        }
      };
      
      socket.onerror = () => {
        setError('Connection failed');
        stop();
      };
      
      socket.onclose = () => stop();
      
      ws.current = socket;
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject('timeout'), 3000);
        socket.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
      
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false }
      });
      
      if (s.getAudioTracks().length === 0) {
        throw new Error('No audio! Check "Share audio"');
      }
      
      stream.current = s;
      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtx.current = ctx;
      
      const src = ctx.createMediaStreamSource(s);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      
      proc.onaudioprocess = (e) => {
        if (ws.current?.readyState !== 1) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        ws.current.send(pcm.buffer);
      };
      
      src.connect(proc);
      proc.connect(ctx.destination);
      processor.current = proc;
      
      s.getTracks().forEach(t => t.onended = stop);
      setRecording(true);
      
    } catch (e) {
      setError(e.message || 'Failed');
      stop();
    }
  };

  return (
    <div className="w-[700px] h-[500px] flex flex-col bg-white font-sans">
      {/* Header */}
      <div className="bg-gray-800 text-white px-4 py-3 flex justify-between items-center">
        <span className="font-bold text-base">Interview Copilot</span>
        <span className="text-xs text-gray-400">
          {history.length} questions
        </span>
      </div>
      
      {/* Controls */}
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

      {/* Two Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Current Q&A */}
        <div className="w-[55%] p-4 border-r bg-gray-50 flex flex-col gap-3 overflow-y-auto">
          <div className="text-xs font-bold text-gray-500 uppercase">
            Current Interview
          </div>

          {/* Question Box */}
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
          
          {/* Answer Box */}
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

        {/* RIGHT: History */}
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
                    {/* <div className="text-green-700 text-xs leading-relaxed max-h-32 overflow-y-auto">
                      A: {h.answer}
                    </div> */}
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