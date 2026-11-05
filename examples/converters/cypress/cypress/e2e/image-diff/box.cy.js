// Three element screenshots of the shared page; e2eVariant=b recolors box-b.
// cypress-image-diff-js names them `<spec name>-<name>`: box.cy-box-a and so on.
const variant = Cypress.expose('e2eVariant');

for (const box of ['a', 'b', 'c']) {
  it(`box-${box}`, () => {
    cy.visit(`pages/box.html?variant=${variant}`);
    cy.get(`#box-${box}`).compareSnapshot({
      name: `box-${box}`,
      testThreshold: 0,
    });
  });
}
