// Three element screenshots of the shared page; e2eVariant=b recolors box-b.
const variant = Cypress.expose('e2eVariant');

for (const box of ['a', 'b', 'c']) {
  it(`box-${box}`, () => {
    cy.visit(`pages/box.html?variant=${variant}`);
    cy.get(`#box-${box}`).matchImage();
  });
}
