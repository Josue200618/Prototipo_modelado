export async function sendMail(to, subject, html) {
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
    const error = new Error('El envío de correo no está configurado. Define BREVO_API_KEY y BREVO_SENDER_EMAIL en .env')
    error.status = 503
    throw error
  }

  const response = await fetch('https://brevo.com', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'Lacombalpalo',
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('Error Brevo:', response.status, detail)
    const fallo = new Error('No se pudo enviar el correo')
    fallo.status = 502
    throw fallo
  }

  return response.json()
}

function wrapLayout(title, bodyHtml) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
      <div style="background-color: #5c3a21; color: #ffffff; padding: 18px 24px;">
        <h2 style="margin: 0; font-size: 20px;">Lacombalpalo</h2>
      </div>
      <div style="padding: 24px; color: #1f2937; line-height: 1.5;">
        <h3 style="margin-top: 0; color: #5c3a21;">${title}</h3>
        ${bodyHtml}
      </div>
      <div style="background-color: #f9fafb; padding: 14px 24px; font-size: 12px; color: #6b7280; text-align: center;">
        Este es un mensaje automático de Lacombalpalo. Por favor no respondas a este correo.
      </div>
    </div>
  `
}

export async function sendRegisterOtpEmail(to, name, code) {
  const html = wrapLayout(
    'Verifica tu correo electrónico',
    `<p>Hola <strong>${name}</strong>,</p>
     <p>Gracias por registrarte en Lacombalpalo. Usa el siguiente código de 6 dígitos para activar tu cuenta:</p>
     <div style="margin: 20px 0; padding: 14px; background: #fef3c7; border-radius: 8px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #92400e;">
       ${code}
     </div>
     <p>Este código vence en <strong>10 minutos</strong> y tiene un máximo de 5 intentos.</p>`,
  )
  return sendMail(to, 'Código de verificación - Lacombalpalo', html)
}

export async function sendWelcomeEmail(to, name) {
  const html = wrapLayout(
    '¡Bienvenido a Lacombalpalo!',
    `<p>Hola <strong>${name}</strong>,</p>
     <p>Tu cuenta ha sido verificada y activada correctamente.</p>
     <p>Ya puedes explorar nuestro catálogo de productos artesanales en madera y realizar tus pedidos en línea.</p>`,
  )
  return sendMail(to, '¡Bienvenido a Lacombalpalo!', html)
}

export async function sendPasswordRecoveryEmail(to, name, code) {
  const html = wrapLayout(
    'Recuperación de contraseña',
    `<p>Hola <strong>${name}</strong>,</p>
     <p>Recibimos una solicitud para restablecer tu contraseña. Ingresa el siguiente código de verificación:</p>
     <div style="margin: 20px 0; padding: 14px; background: #fef3c7; border-radius: 8px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #92400e;">
       ${code}
     </div>
     <p>El código es válido por <strong>15 minutos</strong>. Si no solicitaste este cambio, ignora este mensaje.</p>`,
  )
  return sendMail(to, 'Recuperación de contraseña - Lacombalpalo', html)
}

export async function sendOrderReceiptEmail(to, receipt) {
  const rowsHtml = receipt.items
    .map(
      (item) =>
        `<tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${Number(item.unitPrice * item.quantity).toLocaleString('es-CO')}</td>
        </tr>`,
    )
    .join('')

  const html = wrapLayout(
    `Comprobante de pedido ${receipt.number}`,
    `<p>Hola <strong>${receipt.clientName}</strong>,</p>
     <p>Hemos recibido tu pedido correctamente. Aquí tienes el resumen:</p>
     <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
       <thead>
         <tr style="background: #f3f4f6;">
           <th style="padding: 8px; text-align: left;">Producto</th>
           <th style="padding: 8px; text-align: center;">Cant.</th>
           <th style="padding: 8px; text-align: right;">Subtotal</th>
         </tr>
       </thead>
       <tbody>${rowsHtml}</tbody>
     </table>
     <p><strong>Total:</strong> $${Number(receipt.total).toLocaleString('es-CO')}</p>
     <p><strong>Método de pago:</strong> ${receipt.paymentMethod}</p>
     <p><strong>Dirección de entrega:</strong> ${receipt.address} (${receipt.municipality}, ${receipt.department})</p>`,
  )
  return sendMail(to, `Comprobante de tu pedido ${receipt.number} - Lacombalpalo`, html)
}

export async function sendOrderStatusEmail(to, clientName, orderCode, newStatus) {
  const html = wrapLayout(
    `Actualización de tu pedido ${orderCode}`,
    `<p>Hola <strong>${clientName}</strong>,</p>
     <p>El estado de tu pedido <strong>${orderCode}</strong> ha cambiado a:</p>
     <div style="margin: 16px 0; padding: 12px; background: #ecfdf5; border-left: 4px solid #059669; font-size: 16px; font-weight: bold; color: #065f46;">
       ${newStatus}
     </div>
     <p>Puedes consultar el seguimiento completo iniciando sesión en tu perfil de Lacombalpalo.</p>`,
  )
  return sendMail(to, `Tu pedido ${orderCode} está "${newStatus}" - Lacombalpalo`, html)
}
