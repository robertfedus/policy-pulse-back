// src/utils/emailTemplates.js

/**
 * Generates an HTML email template for patient notifications.
 * @param {Object} params - Parameters for the template.
 * @param {string} params.patientName - Patient's name.
 * @param {string} params.policyName - Policy name.
 * @param {string} params.changeSummary - Summary of policy changes.
 * @returns {string} HTML email content.
 */
function patientNotificationEmail({ patientName, policyName, changeSummary }) {
  return `
    <html>
      <body>
        <h2>Hello ${patientName},</h2>
        <p>We want to inform you about important changes to your policy: <strong>${policyName}</strong>.</p>
        <p>${changeSummary}</p>
        <p>If you have questions, please contact our support team.</p>
        <br/>
        <p>Best regards,<br/>Policy Pulse Team</p>
      </body>
    </html>
  `;
