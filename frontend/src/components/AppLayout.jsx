import { motion } from "framer-motion";
import Nav from "./Nav";
import Header from "./Header";

export default function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-gradient-mesh bg-stone-50">
      <Nav />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />
        <motion.main initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 p-8">
          {children}
        </motion.main>
      </div>
    </div>
  );
}
