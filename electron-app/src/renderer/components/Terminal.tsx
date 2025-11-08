import React, { useCallback, useMemo, useRef, useState } from 'react';

type TerminalLine =
	| { type: 'cmd'; text: string }
	| { type: 'out'; text: string }
	| { type: 'err'; text: string };

type Props = { apiBase: string };

async function apiPost<T>(base: string, path: string, body: unknown): Promise<T> {
	const res = await fetch(`${base}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body ?? {})
	});
	if (!res.ok) {
		throw new Error(`${res.status} ${res.statusText}`);
	}
	return res.json();
}

export function Terminal({ apiBase }: Props) {
	const [lines, setLines] = useState<TerminalLine[]>([
		{ type: 'out', text: 'Ready.' }
	]);
	const [input, setInput] = useState('');
	const viewportRef = useRef<HTMLDivElement>(null);

	const print = useCallback((l: TerminalLine) => {
		setLines((prev) => [...prev, l]);
	}, []);

	const scrollToEnd = useCallback(() => {
		requestAnimationFrame(() => {
			viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight });
		});
	}, []);

	const help = useMemo(
		() =>
			[
				'Help:',
				' scan <dir>',
				' organize "<instructions>"',
				' clean',
				' preview',
				' apply',
				' reset'
			].join('\n'),
		[]
	);

	const run = useCallback(async () => {
		const raw = input.trim();
		if (!raw) return;
		print({ type: 'cmd', text: raw });
		setInput('');

		const [cmd, ...rest] = raw.split(' ');
		try {
			switch (cmd) {
				case 'scan': {
					const dir = rest.join(' ').trim() || '/demo';
					const data = await apiPost<any>(apiBase, '/api/scan', { dir });
					print({ type: 'out', text: JSON.stringify(data, null, 2) });
					break;
				}
				case 'organize': {
					const q = raw.slice('organize'.length).trim().replace(/^\"|\"$/g, '');
					const data = await apiPost<any>(apiBase, '/api/organize', { instructions: q });
					print({ type: 'out', text: JSON.stringify(data, null, 2) });
					break;
				}
				case 'preview': {
					const data = await apiPost<any>(apiBase, '/api/preview', {});
					print({ type: 'out', text: JSON.stringify(data, null, 2) });
					break;
				}
				case 'apply': {
					const data = await apiPost<any>(apiBase, '/api/apply', {});
					print({ type: 'out', text: JSON.stringify(data, null, 2) });
					break;
				}
				case 'clean': {
					const data = await apiPost<any>(apiBase, '/api/detect-garbage', {});
					print({ type: 'out', text: JSON.stringify(data, null, 2) });
					break;
				}
				case 'reset': {
					const data = await apiPost<any>(apiBase, '/api/reset', {});
					print({ type: 'out', text: JSON.stringify(data, null, 2) });
					break;
				}
				case 'help':
				default: {
					print({ type: 'out', text: help });
					break;
				}
			}
		} catch (e: any) {
			print({ type: 'err', text: e?.message || 'Error' });
		} finally {
			scrollToEnd();
		}
	}, [apiBase, help, input, print, scrollToEnd]);

	return (
		<div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
			<div
				ref={viewportRef}
				style={{
					flex: 1,
					padding: 12,
					background: '#0b1021',
					color: '#d1d5db',
					overflow: 'auto',
					fontSize: 13,
					lineHeight: 1.5
				}}
			>
				{lines.map((l, i) => (
					<div key={i} style={{ whiteSpace: 'pre-wrap', color: l.type === 'err' ? '#fca5a5' : l.type === 'cmd' ? '#93c5fd' : '#e5e7eb' }}>
						{l.type === 'cmd' ? `> ${l.text}` : l.text}
					</div>
				))}
			</div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					run();
				}}
				style={{ display: 'flex', gap: 8, padding: 8, borderTop: '1px solid #1f2937', background: '#0b1021' }}
			>
				<input
					autoFocus
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Type a command (help)"
					style={{ flex: 1, padding: '10px 12px', borderRadius: 6, border: '1px solid #374151', background: '#0b122a', color: '#e5e7eb' }}
				/>
				<button type="submit" style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #374151', background: '#111827', color: '#e5e7eb' }}>
					Run
				</button>
			</form>
		</div>
	);
}

