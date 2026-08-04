"use client";

import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

/**
 * Monaco, chargé depuis le bundle — jamais depuis un CDN.
 *
 * Par défaut `@monaco-editor/react` télécharge l'éditeur depuis jsdelivr au
 * premier rendu, ce qu'une plateforme locale-first ne peut pas se permettre :
 * `loader.config({ monaco })` lui donne l'instance importée du paquet npm à la
 * place, et le réseau n'est jamais sollicité.
 *
 * L'unique worker requis est celui du cœur de l'éditeur (le langage `vb` est
 * une simple colorisation Monarch, sans service de langage), instancié via
 * `new URL(...)` pour que le bundler l'emballe lui aussi.
 */

loader.config({ monaco });

if (typeof self !== "undefined") {
  self.MonacoEnvironment = {
    getWorker() {
      return new Worker(
        new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
        { type: "module" }
      );
    }
  };
}

export default function VbaMonaco({ code, onReady }: { code: string; onReady?: () => void }) {
  return (
    <Editor
      height="360px"
      defaultLanguage="vb"
      value={code}
      theme="vs-dark"
      onMount={() => onReady?.()}
      options={{
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        wordWrap: "on",
        ariaLabel: "Module VBA en lecture seule"
      }}
    />
  );
}
