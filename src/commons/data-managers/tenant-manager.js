const Tenant = require("../entities/tenant");
const TenantModel = require("./models/tenantModel");
const SecurityUtils = require("../utilities/security-utils");
const { KeycloakApplication, APP_IDS } = require("../entities/application");

const TENANT_ENCRYPT_KEYS = [
  "paymentMerchantId",
  "paymentProjectId",
  "paymentSecret",
  "noreplyPassword",
  "password",
];

/**
 * Data Manager for Tenant objects.
 */
class TenantManager {
  /**
   * Get all tenants
   * @returns List of tenants
   */
  static async getTenants() {
    const rawTenants = await TenantModel.find();
    return rawTenants.map((rt) => {
      const tenant = new Tenant(rt);
      tenant.applications = tenant.applications.map((app) => {
        let application;
        if (app.id === APP_IDS.KEYCLOAK) {
          application = Object.assign(new KeycloakApplication(), app);
        } else {
          return SecurityUtils.decryptObject(app, TENANT_ENCRYPT_KEYS);
        }
        application.decryptSecret();
        return application;
      });
      return SecurityUtils.decryptObject(tenant, TENANT_ENCRYPT_KEYS);
    });
  }

  /**
   * Get a specific tenant object from the database.
   *
   * @param {string} id Logical identifier of the bookable object
   * @returns A single bookable object
   */
  static async getTenant(id) {
    const rawTenant = await TenantModel.findOne({ id: id });
    if (!rawTenant) {
      return null;
    }
    const tenant = new Tenant(rawTenant);
    tenant.applications = tenant.applications.map((app) => {
      let application;
      if (app.id === APP_IDS.KEYCLOAK) {
        application = Object.assign(new KeycloakApplication(), app);
      } else {
        return SecurityUtils.decryptObject(app, TENANT_ENCRYPT_KEYS);
      }
      application.decryptSecret();
      return application;
    });
    return SecurityUtils.decryptObject(tenant, TENANT_ENCRYPT_KEYS);
  }

  /**
   * Insert a tenant object into the database or update it.
   *
   * @param {Tenant} tenant The tenant object to be stored.
   * @param {boolean} upsert true, if new object should be inserted. Default: true
   * @returns Promise<>
   */
  static async storeTenant(tenant, upsert = true) {
    const newTenant = new Tenant(tenant);

    newTenant.applications = newTenant.applications.map((app) => {
      let application;
      if (app.id === APP_IDS.KEYCLOAK) {
        application = Object.assign(new KeycloakApplication(), app);
      } else {
        return SecurityUtils.encryptObject(app, TENANT_ENCRYPT_KEYS);
      }
      application.encryptSecret();
      return application;
    });
    
    const encryptedTenant = SecurityUtils.encryptObject(newTenant, TENANT_ENCRYPT_KEYS);

    await TenantModel.updateOne({ id: tenant.id }, encryptedTenant, {
      upsert: upsert,
      setDefaultsOnInsert: true,
    });

    return newTenant;
  }

  /**
   * Remove a tenant object from the database.
   *
   * @param {string} id The identifier of the tenant
   * @returns Promise<>
   */
  static async removeTenant(id) {
    await TenantModel.deleteOne({ id: id });
  }

  static async getTenantApps(tenantId) {
    const rawTenant = await TenantModel.findOne({ id: tenantId });
    const tenant = new Tenant(rawTenant);
    tenant.applications = tenant.applications.map((app) => {
      let application;
      if (app.id === APP_IDS.KEYCLOAK) {
        application = Object.assign(new KeycloakApplication(), app);
      } else {
        return SecurityUtils.decryptObject(app, TENANT_ENCRYPT_KEYS);
      }
      application.decryptSecret();
      return application;
    });
    return tenant.applications;
  }

  static async getTenantApp(tenantId, appId) {
    try {
      const tenant = await dbm.get().collection("tenants").findOne({
        id: tenantId,
      });
      const application = tenant.applications.find((app) => app.id === appId);
      
      if (application.id === APP_IDS.KEYCLOAK) {
        const app = Object.assign(new KeycloakApplication(), application);
        app.decryptSecret();
        return app;
      } else {
        return SecurityUtils.decryptObject(application, TENANT_ENCRYPT_KEYS);
      }
    } catch (err) {
      throw new Error(`No tenant found with ID: ${tenantId}`);
    }
  }

  static async getTenantAppByType(tenantId, appType) {
    const rawTenant = await TenantModel.findOne({ id: tenantId });

    const tenant = new Tenant(rawTenant);
    const applications = tenant.applications.filter((app) => app.type === appType);
    return applications.map((app) => {
      if (app.id === APP_IDS.KEYCLOAK) {
        const application = Object.assign(new KeycloakApplication(), app);
        application.decryptSecret();
        return application;
      } else {
        return SecurityUtils.decryptObject(app, TENANT_ENCRYPT_KEYS);
      }
    });
  }

  static async checkTenantCount() {
    const maxTenants = parseInt(process.env.MAX_TENANTS, 10);
    const count = await TenantModel.countDocuments({});
    return !(maxTenants && count >= maxTenants);
  }

  static async getTenantUsers(tenantId) {
    const rawTenant = await TenantModel.findOne({ id: tenantId });
    if (!rawTenant) {
      return null;
    }
    const tenant = new Tenant(rawTenant);
    return tenant.users;
  }

  static async getTenantUsersByRoles(tenantId, roles) {
    const rawTenant = await TenantModel.findOne({ id: tenantId });
    if (!rawTenant) {
      return [];
    }
    const tenant = new Tenant(rawTenant);
    return tenant.users.filter((user) =>
      user.roles.some((role) => roles.includes(role)),
    );
  }
}

module.exports = TenantManager;
