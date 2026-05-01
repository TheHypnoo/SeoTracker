import { createFileRoute } from '@tanstack/react-router';

import { LegalPage } from '../components/legal-page';

export const Route = createFileRoute('/legal/privacy')({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      updated="21 de abril de 2026"
      sections={[
        {
          body: 'Recogemos los datos estrictamente necesarios para prestar el servicio: correo electrónico y nombre para la cuenta, dominios auditados y resultados técnicos de las auditorías que lances.',
          heading: '1. Datos que recogemos',
        },
        {
          body: 'Utilizamos tus datos para gestionar tu cuenta, ejecutar auditorías técnicas SEO sobre los dominios que añadas y enviarte notificaciones relacionadas con el servicio que has contratado.',
          heading: '2. Finalidad del tratamiento',
        },
        {
          body: 'El tratamiento se basa en la ejecución del contrato de servicio que aceptas al registrarte y, cuando aplica, en tu consentimiento explícito (por ejemplo, para comunicaciones comerciales opcionales).',
          heading: '3. Base jurídica',
        },
        {
          body: 'Conservamos tus datos mientras tu cuenta permanezca activa. Las auditorías históricas se retienen según la política de cada plan. Al eliminar tu cuenta se eliminan los datos asociados salvo obligación legal de conservación.',
          heading: '4. Conservación',
        },
        {
          body: 'Puedes ejercer tus derechos de acceso, rectificación, supresión, portabilidad y oposición escribiendo a privacidad@seotracker.test. Tienes derecho a presentar una reclamación ante la autoridad de control competente.',
          heading: '5. Derechos',
        },
        {
          body: 'Trabajamos con proveedores que cumplen la normativa vigente para infraestructura, almacenamiento y envío de correos transaccionales. El listado detallado está disponible bajo solicitud.',
          heading: '6. Encargados de tratamiento',
        },
      ]}
    />
  );
}
