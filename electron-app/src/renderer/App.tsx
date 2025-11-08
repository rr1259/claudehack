import React, { useMemo, useState } from 'react';
import { Terminal } from './components/Terminal';

export default function App() {
	const [apiBase, setApiBase] = useState('http://localhost:3001');
	const info = useMemo(
		() => [
			'Welcome to File Organizer (Demo)',
			'This app operates ONLY on a demo filesystem inside Docker.',
			'Commands:',
			'- scan <dir>',
			'- organize \"<instructions>\"',
			'- clean',
			'- preview',
			'- apply',
			'- reset'
		],
		[]
	);

	return (
		<div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace' }}>
			<div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'center' }}>
				<strong>File Organizer (Docker Demo)</strong>
				<label style={{ marginLeft: 'auto', fontSize: 12 }}>
					API:
					<input
						style={{ marginLeft: 6, padding: '4px 8px', width: 220 }}
						value={apiBase}
						onChange={(e) => setApiBase(e.target.value)}
						placeholder="http://localhost:3001"
					/>
				</label>
			</div>
			<div style={{ padding: 12, color: '#374151', fontSize: 12 }}>
				{info.map((l) => (
					<div key={l}>{l}</div>
				))}
			</div>
			<div style={{ flex: 1 }}>
				<Terminal apiBase={apiBase} />
			</div>
		</div>
	);
}

