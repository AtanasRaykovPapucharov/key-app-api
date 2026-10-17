/**
 * Transactional email templates in English and Bulgarian.
 * Each returns { subject, text, html }. Plain text is always included so
 * the message reads well in any mail client and is less likely to be spam.
 */
const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function layout({ heading, intro, buttonLabel, url, outro, footer }) {
    const safeUrl = escapeHtml(url || "");
    const button = url
        ? `<p style="margin:28px 0"><a href="${safeUrl}" style="background:#e53935;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">${escapeHtml(buttonLabel)}</a></p>
           <p style="font-size:13px;color:#666">${escapeHtml(footer.copy)}<br><a href="${safeUrl}" style="color:#1e88e5;word-break:break-all">${safeUrl}</a></p>`
        : "";
    return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px">
  <div style="background:#fff;border-radius:8px;padding:28px;color:#222;line-height:1.5">
    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
    <p>${escapeHtml(intro)}</p>
    ${button}
    <p style="font-size:13px;color:#666">${escapeHtml(outro)}</p>
  </div>
  <p style="font-size:12px;color:#999;text-align:center">Key App · ${escapeHtml(footer.note)}</p>
</div></body></html>`;
}

const STRINGS = {
    en: {
        footer: { copy: "If the button doesn't work, copy this link into your browser:", note: "Educational trading simulator" },
        verify: {
            subject: "Confirm your email for Key App",
            heading: "Confirm your email",
            intro: (name) => `Hi ${name}, please confirm that this is your email address. This lets you reset your password if you ever forget it.`,
            button: "Confirm email",
            outro: (hours) => `The link expires in ${hours} hours. If you didn't create a Key App account, you can ignore this email.`,
        },
        reset: {
            subject: "Reset your Key App password",
            heading: "Reset your password",
            intro: (name) => `Hi ${name}, we received a request to reset your password.`,
            button: "Choose a new password",
            outro: (minutes) => `The link expires in ${minutes} minutes and works once. If you didn't ask for this, ignore this email — your password stays the same.`,
        },
        changed: {
            subject: "Your Key App password was changed",
            heading: "Your password was changed",
            intro: (name) => `Hi ${name}, the password for your Key App account was just changed and you were signed out on all devices.`,
            outro: () => "If this wasn't you, reset your password right away using “Forgot password?” on the login screen.",
        },
    },
    bg: {
        footer: { copy: "Ако бутонът не работи, копирайте тази връзка в браузъра:", note: "Образователен симулатор за търговия" },
        verify: {
            subject: "Потвърдете имейла си за Key App",
            heading: "Потвърдете имейла си",
            intro: (name) => `Здравейте, ${name}! Моля, потвърдете, че това е вашият имейл адрес. Така ще можете да смените паролата си, ако я забравите.`,
            button: "Потвърди имейла",
            outro: (hours) => `Връзката е валидна ${hours} часа. Ако не сте създавали профил в Key App, просто игнорирайте този имейл.`,
        },
        reset: {
            subject: "Смяна на паролата за Key App",
            heading: "Смяна на паролата",
            intro: (name) => `Здравейте, ${name}! Получихме заявка за смяна на паролата ви.`,
            button: "Избери нова парола",
            outro: (minutes) => `Връзката е валидна ${minutes} минути и може да се използва веднъж. Ако не сте поискали смяна, игнорирайте този имейл — паролата ви остава същата.`,
        },
        changed: {
            subject: "Паролата ви за Key App беше сменена",
            heading: "Паролата ви беше сменена",
            intro: (name) => `Здравейте, ${name}! Паролата на профила ви в Key App току-що беше сменена и излязохте от всички устройства.`,
            outro: () => "Ако това не сте били вие, сменете паролата веднага чрез „Забравена парола?“ на екрана за вход.",
        },
    },
};

const lang = (locale) => (String(locale || "").toLowerCase().startsWith("bg") ? "bg" : "en");

function verifyEmail({ locale, name, url, hours }) {
    const s = STRINGS[lang(locale)];
    const t = s.verify;
    return {
        subject: t.subject,
        text: `${t.intro(name)}\n\n${t.button}: ${url}\n\n${t.outro(hours)}`,
        html: layout({ heading: t.heading, intro: t.intro(name), buttonLabel: t.button, url, outro: t.outro(hours), footer: s.footer }),
    };
}

function resetPassword({ locale, name, url, minutes }) {
    const s = STRINGS[lang(locale)];
    const t = s.reset;
    return {
        subject: t.subject,
        text: `${t.intro(name)}\n\n${t.button}: ${url}\n\n${t.outro(minutes)}`,
        html: layout({ heading: t.heading, intro: t.intro(name), buttonLabel: t.button, url, outro: t.outro(minutes), footer: s.footer }),
    };
}

function passwordChanged({ locale, name }) {
    const s = STRINGS[lang(locale)];
    const t = s.changed;
    return {
        subject: t.subject,
        text: `${t.intro(name)}\n\n${t.outro()}`,
        html: layout({ heading: t.heading, intro: t.intro(name), outro: t.outro(), footer: s.footer }),
    };
}

module.exports = { verifyEmail, resetPassword, passwordChanged, lang };
