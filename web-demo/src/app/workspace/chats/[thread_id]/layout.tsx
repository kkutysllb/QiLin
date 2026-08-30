export function generateStaticParams() {
  return [{ thread_id: "new" }];
}

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
