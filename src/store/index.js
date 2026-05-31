import { configureStore, createSlice } from '@reduxjs/toolkit';  
  
const initialState = {  
  isConnected: false,  
  isRecording: false,  
  currentMode: null,  
  history: [],  
  error: null,  
};  
  
const copilotSlice = createSlice({  
  name: 'copilot',  
  initialState,  
  reducers: {  
    setConnected: (state, action) => {  
      state.isConnected = action.payload;  
    },  
    setRecording: (state, action) => {  
      state.isRecording = action.payload;  
    },  
    setCurrentMode: (state, action) => {  
      state.currentMode = action.payload;  
    },  
    addToHistory: (state, action) => {  
      state.history.push(action.payload);  
    },  
    clearHistory: (state) => {  
      state.history = [];  
    },  
    setError: (state, action) => {  
      state.error = action.payload;  
    },  
  },  
});  
  
export const {   
  setConnected,   
  setRecording,   
  setCurrentMode,   
  addToHistory,   
  clearHistory,  
  setError   
} = copilotSlice.actions;  
  
export const store = configureStore({   
  reducer: { copilot: copilotSlice.reducer }   
});  