import StrategyClient from './StrategyClient';

// Pre-render these paths at build time for static export
export function generateStaticParams() {
  return [
    { id: 'aggressive' },
    { id: 'conservative' },
    { id: 'daily' },
    { id: 'moderate' },
  ];
}

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StrategyClient id={id} />;
}
