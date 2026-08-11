import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Send, Paperclip, Loader2, Check, CheckCheck } from "lucide-react";

function formatTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp * 1000);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ message }) {
  const isFromMe = message.fromMe;
  const ackIcons = { 1: <Check size={14} />, 2: <CheckCheck size={14} />, 3: <CheckCheck size={14} className="text-sky-400" /> };
  const AckIcon = message.ack != null ? (ackIcons[message.ack] || null) : null;

  return (
    <div className={`flex mb-4 ${isFromMe ? "justify-end" : "justify-start"}`}>
      {!isFromMe && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-royal-500 to-royal-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
          ?
        </div>
      )}
      <div className={`max-w-[60%] rounded-2xl px-4 py-2.5 text-sm ${
        isFromMe
          ? "bg-gradient-to-r from-saffron-500 to-saffron-600 text-white rounded-br-md"
          : "bg-stone-100 text-stone-800 rounded-bl-md"
      }`}>
        {message.body && <div className="whitespace-pre-wrap break-words">{message.body}</div>}
        {message.hasMedia && <div className="italic opacity-80">[Media attachment]</div>}
        <div className={`flex items-center gap-1 mt-1 text-xs ${isFromMe ? "text-white/70" : "text-stone-400"} justify-end`}>
          {formatTime(message.timestamp)}
          {isFromMe && AckIcon}
        </div>
      </div>
      {isFromMe && (
        <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs shrink-0 ml-2">
          Me
        </div>
      )}
    </div>
  );
}

export default function ChatWindow({ chat, messages, loading, onSendMessage, onAttach, messageEndRef }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    onSendMessage(text)
      .catch(() => {})
      .finally(() => setSending(false));
    setText("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-stone-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-royal-500 to-royal-600 flex items-center justify-center text-white font-bold text-xs">
          {(chat?.name || chat?.number || "?").split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="font-semibold text-stone-900">{chat?.name || chat?.number || "Select a chat"}</div>
          <div className="text-xs text-stone-500">
            {chat?.isWAContact ? "WhatsApp" : chat?.isCRMContact ? "CRM Contact (not on WhatsApp yet)" : ""}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-stone-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-stone-400 text-sm">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble key={`${msg.id || idx}-${idx}`} message={msg} />
          ))
        )}
        <div ref={messageEndRef} />
      </div>

      <div className="border-t border-stone-200 p-3">
        <div className="flex items-end gap-2">
          <button
            onClick={onAttach}
            type="button"
            className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors shrink-0"
            title="Attach file"
          >
            <Paperclip size={18} />
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            rows={text.length > 60 ? 3 : 1}
            maxLength={4000}
            className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-saffron-400 bg-stone-50"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-saffron-500 to-saffron-600 text-white font-medium shadow-lg shadow-saffron-500/20 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
