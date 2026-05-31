let ws = null;
let port = null;
let audioQueue = [];
let isConnecting = false;

// Convert Uint8Array to base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
      const data = msg.data;
      console.log('Audio data type:', typeof data, 'Length:', data?.length);
      
      if (!data || !Array.isArray(data)) {
        console.error('❌ No audio data');
        return;
      }
      
      // Convert int16 array to binary
      const buffer = new ArrayBuffer(data.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < data.length; i++) {
        view.setInt16(i * 2, data[i], true);
      }
      
      // Convert to base64
      const base64 = arrayBufferToBase64(buffer);
      console.log('📦 Converted to base64, length:', base64.length);
      
      // Send as JSON text
      const message = JSON.stringify({
        type: 'AUDIO',
        data: base64
      });
      
      sendMessage(message);
    }
  });
  
  port.onDisconnect.addListener(() => {
    console.log('🔌 Popup disconnected');
    port = null;
  });
});

function connectWebSocket() {
  if (ws?.readyState === WebSocket.OPEN) {
    console.log('Already connected');
    port?.postMessage({ type: 'CONNECTED' });
    return;
  }
  
  if (isConnecting) {
    console.log('Already connecting...');
    return;
  }
  
  isConnecting = true;
  console.log('🔌 Connecting to WebSocket...');
  
  ws = new WebSocket('wss://interview-copilot-backend-main.up.railway.app/ws');
  
  ws.onopen = () => {
    console.log('✅ WebSocket connected');
    isConnecting = false;
    port?.postMessage({ type: 'CONNECTED' });
    
    // Send queued messages
    while (audioQueue.length > 0) {
      const msg = audioQueue.shift();
      ws.send(msg);
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
  
  ws.onclose = () => {
    console.log('🔒 WebSocket closed');
    isConnecting = false;
    ws = null;
    port?.postMessage({ type: 'DISCONNECTED' });
  };
}

function sendMessage(message) {
  if (!ws) {
    console.log('⏳ WebSocket not ready, queueing');
    audioQueue.push(message);
    return;
  }
  
  if (ws.readyState === WebSocket.OPEN) {
    console.log('📤 Sending message, length:', message.length);
    ws.send(message);
  } else if (ws.readyState === WebSocket.CONNECTING) {
    console.log('⏳ WebSocket connecting, queueing');
    audioQueue.push(message);
  } else {
    console.error('❌ WebSocket not open, state:', ws.readyState);
  }
}

function disconnectWebSocket() {
  console.log('🔌 Disconnecting...');
  audioQueue = [];
  if (ws) {
    ws.close();
    ws = null;
  }
}