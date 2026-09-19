// Função serverless (Vercel) que assina o token do MapKit JS.
// A chave privada .p8 fica SÓ aqui no servidor, nunca no navegador.
//
// Variáveis de ambiente necessárias (Vercel > Settings > Environment Variables):
//   MAPKIT_TEAM_ID      -> seu Team ID (10 caracteres) da conta Apple Developer
//   MAPKIT_KEY_ID       -> o Key ID da chave MapKit (10 caracteres)
//   MAPKIT_PRIVATE_KEY  -> conteúdo do arquivo AuthKey_XXXX.p8 (com -----BEGIN...-----)
//   MAPKIT_ORIGIN       -> (opcional) trava o token a um domínio, ex.: https://seuapp.vercel.app
import jwt from 'jsonwebtoken';

export default function handler(req, res) {
  const { MAPKIT_TEAM_ID, MAPKIT_KEY_ID, MAPKIT_PRIVATE_KEY, MAPKIT_ORIGIN } = process.env;

  if (!MAPKIT_TEAM_ID || !MAPKIT_KEY_ID || !MAPKIT_PRIVATE_KEY) {
    return res.status(500).json({
      error:
        'Faltam credenciais. Configure MAPKIT_TEAM_ID, MAPKIT_KEY_ID e MAPKIT_PRIVATE_KEY nas variáveis de ambiente.',
    });
  }

  // env vars costumam guardar as quebras de linha como \n literais
  const privateKey = MAPKIT_PRIVATE_KEY.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: MAPKIT_TEAM_ID,
    iat: now,
    exp: now + 60 * 30, // 30 minutos; o MapKit renova sozinho quando expira
  };
  if (MAPKIT_ORIGIN) payload.origin = MAPKIT_ORIGIN;

  try {
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      header: { kid: MAPKIT_KEY_ID, typ: 'JWT' },
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ token });
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao assinar o token: ' + e.message });
  }
}
