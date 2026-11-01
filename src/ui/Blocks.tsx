// Guide blocks: paragraphs, lists, tables.

import type { Block } from '../types';
import { Inline } from './Inline';
import { Table } from './Table';

export function Blocks({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((b, i) => <BlockView key={i} block={b} />)}</>;
}

function BlockView({ block }: { block: Block }) {
  switch (block.t) {
    case 'p':
      return <p><Inline text={block.text} /></p>;
    case 'table':
      return <Table head={block.head} rows={block.rows} />;
    case 'code':
      return <pre className="pre"><code>{block.text}</code></pre>;
    case 'ul':
    case 'ol': {
      const items = block.items.map((it, i) => (
        <li key={i}>
          <Inline text={it.text} />
          {it.children && <Blocks blocks={it.children} />}
        </li>
      ));
      return block.t === 'ol'
        ? <ol className="prose-list" start={block.start}>{items}</ol>
        : <ul className="prose-list">{items}</ul>;
    }
  }
}
