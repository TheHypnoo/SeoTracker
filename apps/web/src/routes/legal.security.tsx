import { createFileRoute } from '@tanstack/react-router';

import { LegalPage } from '../components/legal-page';

export const Route = createFileRoute('/legal/security')({
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <LegalPage
      title="Seguridad"
      updated="21 de abril de 2026"
      sections={[
        {
          body: 'Gestionamos las sesiones con tokens JWT firmados, rotación de refresh token y revocación en servidor. Las contraseñas se almacenan con hashing moderno (argon2/bcrypt) y nunca se guardan en texto plano.',
          heading: 'Autenticación',
        },
        {
          body: 'Cada petición aplica controles explícitos de proyecto y dominio para que un usuario nunca pueda acceder a datos de otra organización. Los intentos de acceso cruzado devuelven 403/404.',
          heading: 'Aislamiento multi-tenant',
        },
        {
          body: 'La plataforma se despliega en contenedores aislados con Postgres y Redis privados. Las variables sensibles se gestionan vía entorno y nunca se exponen al cliente.',
          heading: 'Infraestructura',
        },
        {
          body: 'Registramos eventos relevantes del sistema y fallos de trabajos asíncronos para poder diagnosticar incidentes sin exponer datos sensibles.',
          heading: 'Auditoría y logs',
        },
        {
          body: 'Si detectas una vulnerabilidad, escríbenos a seguridad@seotracker.test. Respondemos a reportes responsables y evitamos represalias contra investigadores que actúen de buena fe.',
          heading: 'Reporte de vulnerabilidades',
        },
      ]}
    />
  );
}
