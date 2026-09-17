import test from 'node:test';
import assert from 'node:assert/strict';
import {
	resolveExpiry,
	normalizeUrl,
	linkStatus,
	isReadableQr,
	readJson,
	errorText,
} from '../src/ui.ts';

test('resolveExpiry sends only the active mode', () => {
	assert.equal(resolveExpiry({ expires_in_hours: 'CUSTOM', custom_expires_in_hours: 48 }), 48);
	assert.equal(resolveExpiry({ expires_in_hours: 24, custom_expires_in_hours: 99 }), 24);
	assert.equal(resolveExpiry({ expires_in_hours: 'CUSTOM' }), null);
	assert.equal(resolveExpiry({}), null);
});

test('normalizeUrl prefixes https and rejects bad input', () => {
	assert.equal(normalizeUrl('example.com/x'), 'https://example.com/x');
	assert.equal(normalizeUrl('http://a.b'), 'http://a.b/');
	assert.throws(() => normalizeUrl('ftp://x.com'), /http/);
	assert.throws(() => normalizeUrl('https://user:pass@x.com'), /sign-in/);
	assert.throws(() => normalizeUrl('not a url'));
});

test('linkStatus reflects backend 410 conditions', () => {
	const t = Date.now();
	// At/over the cap the backend refuses redirects even before expiry.
	assert.equal(
		linkStatus({ expires_at: new Date(t + 60000).toISOString(), max_clicks: 5, click_count: 5 }),
		'Click limit reached',
	);
	assert.equal(
		linkStatus({ expires_at: new Date(t - 1000).toISOString(), max_clicks: null, click_count: 0 }),
		'Expired',
	);
	assert.equal(linkStatus({ expires_at: null, max_clicks: 5, click_count: 5 }), 'Click limit reached');
	assert.equal(linkStatus({ expires_at: null, max_clicks: 5, click_count: 4 }), 'Active');
});

test('isReadableQr rejects unreadable palettes', () => {
	assert.equal(isReadableQr('000000', '000000'), false); // black on black
	assert.equal(isReadableQr('ffffff', 'ffffff'), false); // white on white
	assert.equal(isReadableQr('black', 'white'), true); // default pairing
	assert.equal(isReadableQr('black', '1e293b'), false); // black on dark slate (1.44:1)
	assert.equal(isReadableQr('1d4ed8', '0f172a'), false); // navy on dark bg (2.66:1)
	assert.equal(isReadableQr('white', '1e293b'), false); // inverted (light-on-dark) QRs scan unreliably
});

test('readJson maps API errors to user-facing text', async () => {
	const fail = async (response: Response) => errorText(await readJson(response).catch((e) => e));

	assert.equal(
		await fail(new Response(JSON.stringify({ detail: 'Alias taken' }), { status: 409 })),
		'Alias taken',
	);
	assert.equal(
		await fail(
			new Response(JSON.stringify({ detail: [{ loc: ['body', 'url'], msg: 'bad' }] }), { status: 422 }),
		),
		'url: bad',
	);
	assert.equal(
		await fail(new Response('gateway timeout', { status: 502 })),
		'Request failed (502). Please try again.',
	);
});
