const healthHandler = () =>
  new Response(JSON.stringify({ service: 'web', status: 'ok' }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default healthHandler;
