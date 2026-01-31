import Link from 'next/link';

export function AuthCard(props: {
  readonly title: string;
  readonly subtitle: string;
  readonly children: React.ReactNode;
  readonly footer?: {
    readonly text: string;
    readonly href: string;
    readonly linkText: string;
  };
}) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">{props.title}</h1>
        <p className="mt-1 text-sm text-zinc-400">{props.subtitle}</p>
      </div>

      {props.children}

      {props.footer ? (
        <div className="mt-6 text-sm text-zinc-400">
          {props.footer.text}{' '}
          <Link className="text-zinc-50 underline underline-offset-4" href={props.footer.href}>
            {props.footer.linkText}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

