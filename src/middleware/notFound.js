export default function notFound(_req, res, _next) {
  res.status(404).json({ error: 'Not Found' });
}
