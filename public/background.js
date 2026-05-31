let ws = null;
let port = null;
let audioQueue = [];
let isConnecting = false;

chrome.runtime.onConnect.addListener((p) => {
  console.log('🔌 Popup connected');
  port = p;
  
  port.onMessage.addListener((msg) => {
    console.log('📨 Background received:', msg.type);
    
    if (msg.type === 'CONNECT') {
      connectWebSocket();
    } else if (msg.type === 'DISCONNECT') {
      disconnectWebSocket();
    } else if (msg.type === 'AUDIO') {
      // Handle ArrayBuffer from Chrome extension
      const data = msg.data;
      console.log('Audio data type:', typeof data, 'Length:', data?.length || data?.byteLength);
      
      if (!data) {
        console.error('❌ No audio data received');
        return;
      }
      
      // Convert to Uint8Array if needed
      let buffer;
      if (data instanceof ArrayBuffer) {
        buffer = new Uint8Array(data);
      } else if (Array.isArray(data)) {
        buffer = new Uint8Array(data);
      } else {
        buffer = data;
      }
      
      sendAudio(buffer);
    }
  });
  
  port.onDisconnect.addListener(() => {
    console.log('🔌 Popup disconnected');
    port = null;
  });
});

function connectWebSocket() {
  if (ws?.readyState === WebSocket.OPEN || isConnecting) {
    console.log('Already connected or connecting');
    return;
  }
  
  isConnecting = true;
  console.log('🔌 Connecting to WebSocket...');
  
  ws = new WebSocket('wss://interview-copilot-backend-main.up.railway.app/ws');
  
  ws.onopen = () => {
    console.log('✅ WebSocket connected');
    isConnecting = false;
    port?.postMessage({ type: 'CONNECTED' });
    
    // Send any queued audio
    while (audioQueue.length > 0) {
      const data = audioQueue.shift();
      ws.send(data);
    }
  };
  
  ws.onmessage = (event) => {
    console.log('📥 Received:', event.data);
    port?.postMessage({ type: 'MESSAGE', data: event.data });
  };
  
  ws.onerror = (err) => {
    console.error('❌ WebSocket error:', err);
    isConnecting = false;
    port?.postMessage({ type: 'ERROR', error: 'Connection failed' });
  };
  
  ws.onclose = (event) => {
    console.log('🔒 WebSocket closed. Code:', event.code, 'Reason:', event.reason);
    isConnecting = false;
    ws = null;
    port?.postMessage({ type: 'DISCONNECTED' });
  };
}

function sendAudio(data) {
  if (!ws) {
    console.log('⏳ WebSocket not ready, queueing audio');
    audioQueue.push(data);
    return;
  }
  
  if (ws.readyState === WebSocket.OPEN) {
    console.log('📤 Sending audio, bytes:', data.byteLength || data.length);
    ws.send(data);
  } else if (ws.readyState === WebSocket.CONNECTING) {
    console.log('⏳ WebSocket connecting, queueing audio');
    audioQueue.push(data);
  } else {
    console.error('❌ WebSocket not open, state:', ws.readyState);
    audioQueue.push(data);
  }
}

function disconnectWebSocket() {
  audioQueue = [];
  ws?.close();
  ws = null;
}