import { installDomShim } from "./dom-shim";

// Install before any test module's imports run, so zustand's persist
// middleware sees a real `window.localStorage` on first evaluation.
installDomShim();
