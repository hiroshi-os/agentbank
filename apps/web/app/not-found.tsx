import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <div className="text-[11px] uppercase tracking-[0.22em] text-brass">Missing folio</div>
      <h1 className="serif mt-3 text-4xl">No such account</h1>
      <p className="mt-3 text-sm text-muted">That agent or page is not in this ledger.</p>
      <Link href="/" className="mt-6 inline-block text-brass underline-offset-4 hover:underline">
        Back to the reserve
      </Link>
    </div>
  );
}
