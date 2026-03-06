// No-op stubs for Tauri APIs in web-only mode
export const invoke = async () => { throw new Error('Desktop runtime not available'); };
export const fetch = globalThis.fetch;
export const listen = async () => () => {};
export const getVersion = async () => '0.0.0';
export const getCurrentWebview = () => ({});
export const check = async () => null;
export const relaunch = async () => window.location.reload();
export const downloadDir = async () => '';
export const homeDir = async () => '';
export const join = async (...parts: string[]) => parts.join('/');
export const onOpenUrl = async () => () => {};
export const openPath = async (url: string) => window.open(url, '_blank');
export const revealItemInDir = async () => {};
export const open = async () => null;
export const save = async () => null;
export default {};
