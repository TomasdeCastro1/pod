import { Resend } from 'resend';
import type { Config } from '../config.js';
import { logger } from '../logger.js';

export interface EmailSender {
  sendCode(email: string, code: string): Promise<void>;
}

const SUBJECT = 'Tu código de acceso';

function body(code: string): string {
  return `Tu código de acceso es ${code}. Vence en 10 minutos. Si no lo pediste, ignorá este mensaje.`;
}

/** Desarrollo: no envía nada. Imprime el código solo con NODE_ENV=development. */
export function createConsoleSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  return {
    sendCode(_email, code) {
      if (env.NODE_ENV === 'development') {
        // Solo desarrollo local: es la única forma de ver el código sin servicio de email.
        process.stdout.write(`[email:console] código de acceso: ${code}\n`);
      } else {
        logger.info({ event: 'email.code_sent' });
      }
      return Promise.resolve();
    },
  };
}

export function createResendSender(apiKey: string, from: string): EmailSender {
  const resend = new Resend(apiKey);
  return {
    async sendCode(email, code) {
      const { error } = await resend.emails.send({
        from,
        to: email,
        subject: SUBJECT,
        text: body(code),
      });
      if (error) throw new Error(`No se pudo enviar el email (${error.name})`);
    },
  };
}

export function createEmailSender(
  config: Pick<Config, 'EMAIL_DRIVER' | 'RESEND_API_KEY' | 'EMAIL_FROM'>,
): EmailSender {
  if (config.EMAIL_DRIVER === 'resend') {
    if (!config.RESEND_API_KEY) throw new Error('EMAIL_DRIVER=resend requiere RESEND_API_KEY');
    return createResendSender(config.RESEND_API_KEY, config.EMAIL_FROM);
  }
  return createConsoleSender();
}
