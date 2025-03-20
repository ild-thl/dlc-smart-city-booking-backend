class Application {
  constructor(id, type, active = false) {
    this.id = id;
    this.type = type;
    this.active = active;
  }

  encryptSecret() {
    throw new Error("Method not implemented");
  }

  decryptSecret() {
    throw new Error("Method not implemented");
  }
}

module.exports = { Application };
