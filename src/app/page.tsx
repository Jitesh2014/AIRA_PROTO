import { VercelV0Chat } from "@/components/ui/v0-ai-chat";

export default function Home() {
  return (
    <main className="relative flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center overflow-hidden py-8 sm:py-16">
      <VercelV0Chat />
    </main>
  );
}
