/**
 * Narrow context-isolated bridge for document dialogs and window lifecycle.
 * Never exposes Electron events, general-purpose IPC, or Node APIs to content.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  open: () => ipcRenderer.invoke('open-document'),
  save: (input: unknown) => ipcRenderer.invoke('save-document', input),
  confirmReplace: () => ipcRenderer.invoke('confirm-replace'),
  close: () => ipcRenderer.invoke('close-window'),
  onClose: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('request-close', listener);
    return () => ipcRenderer.removeListener('request-close', listener);
  },
});
