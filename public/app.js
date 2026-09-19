const form = document.querySelector("#registration-form");
const formView = document.querySelector("#form-view");
const successView = document.querySelector("#success-view");
const submitButton = document.querySelector("#submit-button");
const buttonLabel = submitButton.querySelector(".button-label");
const formError = document.querySelector("#form-error");
const formErrorMessage = document.querySelector("#form-error-message");
const messageLink = document.querySelector("#message-link");
const openMessages = document.querySelector("#open-messages");
const registerAnother = document.querySelector("#register-another");

const fields = {
  firstName: document.querySelector("#first-name"),
  lastName: document.querySelector("#last-name"),
  email: document.querySelector("#email"),
  phone: document.querySelector("#phone"),
  consent: document.querySelector("#consent"),
};

function setFieldError(name, message = "") {
  const field = fields[name];
  const error = document.querySelector(`#${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-error`);
  if (!field || !error) return;

  error.textContent = message;
  if (message) {
    field.setAttribute("aria-invalid", "true");
    field.setAttribute(
      "aria-describedby",
      name === "phone" ? `phone-hint ${error.id}` : error.id,
    );
  } else {
    field.removeAttribute("aria-invalid");
    if (name === "phone") field.setAttribute("aria-describedby", "phone-hint phone-error");
    else field.removeAttribute("aria-describedby");
  }
}

function clearErrors() {
  formError.hidden = true;
  Object.keys(fields).forEach((name) => setFieldError(name));
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.setAttribute("aria-busy", String(isLoading));
  submitButton.classList.toggle("is-loading", isLoading);
  buttonLabel.textContent = isLoading ? "Connecting…" : "Connect";
}

function focusFirstError(errors) {
  const firstName = Object.keys(fields).find((name) => errors[name]);
  if (firstName) fields[firstName].focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const data = new FormData(form);
  const payload = {
    firstName: data.get("firstName"),
    lastName: data.get("lastName"),
    email: data.get("email"),
    phone: data.get("phone"),
    consent: data.get("consent") === "on",
  };

  setLoading(true);
  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok) {
      const errors = result.errors || {};
      Object.entries(errors).forEach(([name, message]) => setFieldError(name, message));
      formErrorMessage.textContent = result.message || "Check your details and try again.";
      formError.hidden = false;
      focusFirstError(errors);
      if (Object.keys(errors).length === 0) formError.focus();
      return;
    }

    const number = result.assignedPhoneNumber;
    messageLink.textContent = number;
    messageLink.href = `sms:${number}`;
    openMessages.href = `sms:${number}`;
    formView.hidden = true;
    successView.hidden = false;
    successView.setAttribute("tabindex", "-1");
    successView.focus();
  } catch {
    formErrorMessage.textContent = "The server could not be reached. Make sure DNM is running and try again.";
    formError.hidden = false;
    formError.focus();
  } finally {
    setLoading(false);
  }
});

registerAnother.addEventListener("click", () => {
  form.reset();
  clearErrors();
  successView.hidden = true;
  formView.hidden = false;
  fields.firstName.focus();
});
