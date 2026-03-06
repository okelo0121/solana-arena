export async function getHistoricalCandles(symbol = 'SOLUSDT', interval = '1m', limit = 100) {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const data = await res.json();
    return data.map(d => ({
        time: Math.floor(d[0] / 1000), // convert ms to seconds
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4])
    }));
}

export function subscribeLiveCandles(symbol = 'SOLUSDT', interval = '1m', onUpdate, onError) {
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log(`[MarketData] WebSocket connected: ${symbol} @ ${interval}`);
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.k) {
                onUpdate({
                    time: Math.floor(msg.k.t / 1000),
                    open: parseFloat(msg.k.o),
                    high: parseFloat(msg.k.h),
                    low: parseFloat(msg.k.l),
                    close: parseFloat(msg.k.c),
                    isClosed: msg.k.x
                });
            }
        } catch (err) {
            console.error('[MarketData] Failed to parse WebSocket message:', err);
            if (onError) onError(err);
        }
    };

    ws.onerror = (error) => {
        console.error('[MarketData] WebSocket error:', error);
        if (onError) onError(error);
    };

    ws.onclose = (event) => {
        if (!event.wasClean) {
            console.log(`[MarketData] WebSocket closed unexpectedly: ${event.code} ${event.reason}`);
        } else {
            console.log('[MarketData] WebSocket closed cleanly');
        }
    };

    // Return enhanced WebSocket with explicit close method
    return {
        close: () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close(1000, 'Component unmounting');
            }
        },
        get readyState() {
            return ws.readyState;
        }
    };
}
