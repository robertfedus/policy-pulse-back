// test/utils/emailTemplates.test.js

const { patientNotificationEmail } = require('../../src/utils/emailTemplates');

describe('patientNotificationEmail', () => {
  it('should generate correct HTML with provided parameters', () => {
    const params = {
      patientName: 'John Doe',
      policyName: 'HealthyCare Basic',
      changeSummary: 'Your coverage for dental care has been updated.',
    };
    const emailHtml = patientNotificationEmail(params);

    expect(emailHtml).toContain('Hello John Doe');
    expect(emailHtml).toContain('HealthyCare Basic');
    expect(emailHtml).toContain('Your coverage for dental care has been updated.');
    expect(emailHtml).toContain('Policy Pulse Team');
    expect(emailHtml).toMatch(/<html>[\s\S]*<\/html>/);
  });

  it('should handle empty parameters gracefully', () => {
    const params = {
      patientName: '',
      policyName: '',
      changeSummary: '',
    };
    const emailHtml = patientNotificationEmail(params);

    expect(emailHtml).toContain('Hello ');
    expect(emailHtml).toContain('policy: <strong></strong>');
    expect(emailHtml).toContain('<p></p>');
  });
});
