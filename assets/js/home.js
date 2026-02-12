const bgText = document.getElementById("bgText");
const text = "I LOVE RADEK NEVARIL ";
const isMobile = window.innerWidth < 768;
const rows = isMobile ? 50 : 100;
const cols = isMobile ? 5 : 10;

if (bgText) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < rows; i++) {
    const line = document.createElement("div");
    line.textContent = text.repeat(cols);
    fragment.appendChild(line);
  }
  bgText.replaceChildren(fragment);
}

const avatarLink = document.getElementById("avatarLink");
if (avatarLink) {
  avatarLink.addEventListener("click", () => {
    window.location.href = "/rajnoha";
  });
}

const card = document.querySelector(".profile-card");
if (!isMobile && card && typeof VanillaTilt !== "undefined") {
  VanillaTilt.init(card, {
    max: 10,
    speed: 400,
    glare: true,
    "max-glare": 0.05,
  });
}
