import Nav from "./Nav";

export default function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-stone-50">
      <Nav />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
