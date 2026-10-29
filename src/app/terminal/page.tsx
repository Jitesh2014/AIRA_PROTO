// src/app/terminal/page.tsx

import CodeTerminal from "@/components/ui/code-terminal";

export default function TerminalPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-white mb-6">💻 Code Terminal</h1>
      <CodeTerminal />
    </div>
  );
}