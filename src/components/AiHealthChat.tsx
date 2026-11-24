import { useState } from "react";
import { MessageSquareHeart, Send, X } from "lucide-react";
import { apiRequest } from "../lib/api.ts";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface AiHealthChatProps {
  isOpen: boolean;
  onClose: () => void;
  onBookFromChat: () => void;
}

const STARTER_PROMPTS = [
  "Which specialist should I book for frequent migraines?",
  "I have knee pain after running. Who can help?",
  "How do I check available slots and reschedule?",
];

export function AiHealthChat({ isOpen, onClose, onBookFromChat }: AiHealthChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hello, I am the SmartCare Health Guide. Describe your symptoms or care needs and I can share general health guidance and recommend the right SmartCare department and doctor.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    setError("");
    const nextHistory = [...messages, { role: "user" as const, text: trimmed }];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);

    try {
      const res = await apiRequest<{ reply: string }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed,
          history: messages,
        }),
      });
      setMessages([...nextHistory, { role: "assistant", text: res.reply }]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not reach the health assistant.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      aria-label="SmartCare Health Guide"
      className="fixed right-4 bottom-4 z-50 flex h-[540px] max-h-[82vh] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-[#DCE7F5] bg-white shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[#DCE7F5] bg-[#1976D2] px-4 py-3.5 text-white">
        <div className="flex items-center gap-2.5">
          <MessageSquareHeart className="h-5 w-5" aria-hidden="true" />
          <div>
            <h2 className="font-display text-sm font-bold">SmartCare Health Guide</h2>
            <p className="text-xs text-blue-100">General guidance & specialist routing</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close health guide"
          className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-[#F4F9FF] p-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
              msg.role === "user"
                ? "ml-auto bg-[#1976D2] text-white"
                : "border border-[#DCE7F5] bg-white text-slate-800"
            }`}
          >
            <p className="whitespace-pre-wrap">{msg.text}</p>
          </div>
        ))}

        {loading && (
          <div className="max-w-[75%] rounded-xl border border-[#DCE7F5] bg-white px-3.5 py-2.5 text-xs text-slate-500">
            Reviewing specialist directory...
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700" role="alert">
            {error}
          </div>
        )}

        {messages.length === 1 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold text-slate-500">Suggested questions</p>
            {STARTER_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => sendMessage(q)}
                className="block w-full rounded-lg border border-[#DCE7F5] bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:border-[#1976D2] hover:text-[#1976D2]"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[#DCE7F5] bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>Not a medical diagnosis. Call 911 for emergencies.</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onBookFromChat();
            }}
            className="font-semibold text-[#1976D2] hover:underline"
          >
            Book Visit
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about symptoms or specialists..."
            className="flex-1 rounded-lg border border-[#DCE7F5] px-3 py-2 text-sm focus:border-[#1976D2] focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send message"
            className="inline-flex items-center justify-center rounded-lg bg-[#1976D2] px-3.5 py-2 text-white hover:bg-[#1565C0] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
