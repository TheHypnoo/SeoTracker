import { createFileRoute } from '@tanstack/react-router';

import { LegalPage } from '../components/legal-page';

export const Route = createFileRoute('/legal/terms')({
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Términos y condiciones"
      updated="21 de abril de 2026"
      sections={[
        {
          body: 'Estos términos regulan el uso de SEOTracker, una plataforma SaaS orientada a la auditoría técnica SEO, desarrollada como Trabajo de Fin de Grado con fines demostrativos y académicos.',
          heading: '1. Objeto',
        },
        {
          body: 'Eres responsable de mantener la confidencialidad de tus credenciales y de toda la actividad realizada con tu cuenta. Debes proporcionar información veraz al registrarte.',
          heading: '2. Cuenta y responsabilidad',
        },
        {
          body: 'Únicamente puedes auditar dominios sobre los que tengas autorización. Está prohibido usar la plataforma para tareas ilícitas, saturar sitios de terceros o eludir medidas de seguridad.',
          heading: '3. Uso aceptable',
        },
        {
          body: 'Hacemos esfuerzos razonables para mantener el servicio disponible, pero no garantizamos ausencia de interrupciones, especialmente por tratarse de un desarrollo académico.',
          heading: '4. Disponibilidad',
        },
        {
          body: 'Todos los componentes de la plataforma (código, interfaz, marca) están protegidos. Obtienes una licencia limitada, no exclusiva y revocable para usar el servicio durante la vigencia de tu suscripción.',
          heading: '5. Propiedad intelectual',
        },
        {
          body: 'SEOTracker no se hace responsable de decisiones tomadas únicamente a partir de los informes generados. Los resultados son una herramienta de apoyo, no un juicio profesional definitivo.',
          heading: '6. Limitación de responsabilidad',
        },
        {
          body: 'Podemos actualizar estos términos. Te avisaremos con antelación razonable cuando los cambios afecten a obligaciones esenciales.',
          heading: '7. Modificaciones',
        },
      ]}
    />
  );
}
