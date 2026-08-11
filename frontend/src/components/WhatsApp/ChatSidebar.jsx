import { useState } from "react";
import { motion } from "framer-motion";
import { Users, MessageCircle, RefreshCw, Search, Phone } from "lucide-react";

function normalizePhone(phone) {
  if (!phone) return "";
  let d = String(phone).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.substring(2);
  if (d.startsWith("0")) d = "91" + d.substring(1);
  if (!d.startsWith("91")) d = "91" + d;
  return d;
}

export default function ChatSidebar({ chats, contacts, selectedChat, onSelectChat, onRefreshContacts }) {
  const [activeTab, setActiveTab] = useState("contacts");
  const [search, setSearch] = useState("");

  const filteredContacts = contacts.filter((c) =>
    (c.name || c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredChats = chats.filter((c) =>
    (c.name || c.number || "").toLowerCase().includes(search.toLowerCase())
  );

  const displayItems = activeTab === "contacts" ? filteredContacts : filteredChats;

  function handleSelectContact(contact) {
    const waChat = chats.find((ch) => ch.number === normalizePhone(contact.phone));
    if (waChat) {
      onSelectChat({
        id: waChat.id,
        name: contact.name || waChat.name,
        number: waChat.number,
        phoneNorm: normalizePhone(contact.phone),
        isCRMContact: true,
        isWAContact: true,
      });
    } else {
      onSelectChat({
        name: contact.name,
        number: null,
        phoneNorm: normalizePhone(contact.phone),
        isCRMContact: true,
        isWAContact: null,
      });
    }
  }

  function handleSelectChat(chat) {
    onSelectChat({
      id: chat.id,
      name: chat.name,
      number: chat.number,
      phoneNorm: chat.number ? normalizePhone(chat.number) : null,
      isCRMContact: false,
      isWAContact: chat.isWAContact,
      unreadCount: chat.unreadCount,
    });
  }

  return (
    <div className="w-72 shrink-0 border-r border-stone-200 flex flex-col bg-stone-50/50">
      <div className="p-3 border-b border-stone-200">
        <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1 text-xs font-medium">
          <button
            onClick={() => setActiveTab("contacts")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "contacts" ? "bg-white shadow text-stone-900" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <Users size={12} /> Contacts
          </button>
          <button
            onClick={() => setActiveTab("chats")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "chats" ? "bg-white shadow text-stone-900" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <MessageCircle size={12} /> Chats
          </button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-stone-200">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400"
          />
        </div>
        {activeTab === "contacts" && (
          <button onClick={onRefreshContacts} className="mt-1.5 flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700">
            <RefreshCw size={11} /> Sync contacts
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {displayItems.length === 0 ? (
          <div className="p-4 text-center text-sm text-stone-400">
            {activeTab === "contacts" ? "No CRM contacts found" : "No WhatsApp chats yet"}
          </div>
        ) : (
          <div className="py-1">
            {displayItems.map((item, idx) => {
              const isSelected =
                selectedChat?.id === item.id ||
                (activeTab === "contacts" && selectedChat?.phoneNorm === normalizePhone(item.phone));
              return (
                <motion.button
                  key={activeTab === "contacts" ? `c-${item.id}` : `w-${item.id}`}
                  onClick={() => activeTab === "contacts" ? handleSelectContact(item) : handleSelectChat(item)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                    isSelected ? "bg-saffron-50 border-r-2 border-saffron-500" : "hover:bg-stone-100"
                  }`}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-royal-500 to-royal-600 flex items-center justify-center text-white font-medium text-xs">
                    {(activeTab === "contacts" ? item.name : item.name || item.number || "?")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .substring(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-stone-900 truncate">
                      {activeTab === "contacts" ? (item.name || item.email || "Unnamed") : (item.name || item.number)}
                    </div>
                    {activeTab === "contacts" ? (
                      <div className="flex items-center gap-1 text-xs text-stone-500">
                        {item.phone ? (
                          <>
                            <Phone size={10} />
                            <span>{item.phone}</span>
                          </>
                        ) : (
                          <span>No phone</span>
                        )}
                        {item.isWhatsApp && (
                          <span className="ml-1 px-1.5 py-0.25 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium">
                            WhatsApp
                          </span>
                        )}
                        {!item.isWhatsApp && item.phone && (
                          <span className="ml-1 px-1.5 py-0.25 bg-stone-200 text-stone-600 rounded-full text-[10px]">
                            Not on WA
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-stone-500 truncate">
                        {item.lastMessage?.body || "No messages"}
                      </div>
                    )}
                  </div>
                  {activeTab === "chats" && item.unreadCount > 0 && (
                    <div className="w-5 h-5 bg-saffron-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {item.unreadCount}
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
