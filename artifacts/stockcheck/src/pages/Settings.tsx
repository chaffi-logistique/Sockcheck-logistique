import { useState, useEffect } from "react";
import { api } from "../api";

interface SettingsData {
  shopifyShopDomain: string;
  shopifyAccessToken: string;
  shopifyClientId: string;
  shopifyClientSecret: string;
  shopifyWebhookSecret: string;
  shopifyEnabled: boolean;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData>({
    shopifyShopDomain: "",
    shopifyAccessToken: "",
    shopifyClientId: "",
    shopifyClientSecret: "",
    shopifyWebhookSecret: "",
    shopifyEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTokens, setShowTokens] = useState(false);

  useEffect(() => {
    api.getSettings().then((data: SettingsData) => {
      setSettings(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert("Erreur lors de la sauvegarde");
    }
    setSaving(false);
  };

  const update = (key: keyof SettingsData, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="page"><div className="empty-state">Chargement...</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>⚙️ Paramètres</h2>
      </div>

      <div className="settings-grid">
        {/* Shopify Integration */}
        <div className="card settings-section">
          <div className="settings-section-header">
            <h3>🛍 Intégration Shopify</h3>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.shopifyEnabled}
                onChange={e => update("shopifyEnabled", e.target.checked)}
              />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span>{settings.shopifyEnabled ? "Activée" : "Désactivée"}</span>
            </label>
          </div>

          {settings.shopifyEnabled && (
            <div className="settings-info-banner">
              <strong>ℹ️ Fonctionnement :</strong> Lors d'un scan conforme, le stock Shopify sera automatiquement ajusté (+1). Les scans défectueux et inattendus ne mettent pas à jour Shopify.
            </div>
          )}

          <div className="form-row">
            <label>Domaine boutique Shopify</label>
            <input
              value={settings.shopifyShopDomain}
              onChange={e => update("shopifyShopDomain", e.target.value)}
              placeholder="votre-boutique.myshopify.com"
            />
          </div>

          <div className="form-row">
            <label>
              Access Token Shopify
              <button className="btn-link" onClick={() => setShowTokens(!showTokens)}>{showTokens ? "Masquer" : "Afficher"}</button>
            </label>
            <input
              type={showTokens ? "text" : "password"}
              value={settings.shopifyAccessToken}
              onChange={e => update("shopifyAccessToken", e.target.value)}
              placeholder="shpat_xxxxx (ou *** si déjà enregistré)"
            />
          </div>

          <div className="form-row">
            <label>Client ID Shopify (OAuth)</label>
            <input
              type={showTokens ? "text" : "password"}
              value={settings.shopifyClientId}
              onChange={e => update("shopifyClientId", e.target.value)}
              placeholder="Optionnel — pour OAuth"
            />
          </div>

          <div className="form-row">
            <label>Client Secret Shopify (OAuth)</label>
            <input
              type={showTokens ? "text" : "password"}
              value={settings.shopifyClientSecret}
              onChange={e => update("shopifyClientSecret", e.target.value)}
              placeholder="Optionnel — pour OAuth"
            />
          </div>

          <div className="form-row">
            <label>Webhook Secret (HMAC)</label>
            <input
              type={showTokens ? "text" : "password"}
              value={settings.shopifyWebhookSecret}
              onChange={e => update("shopifyWebhookSecret", e.target.value)}
              placeholder="Pour vérifier les webhooks Shopify"
            />
          </div>

          <div className="settings-hint">
            <strong>Variables d'environnement supportées :</strong><br />
            <code>SHOPIFY_SHOP_DOMAIN</code>, <code>SHOPIFY_CLIENT_ID</code>,{" "}
            <code>SHOPIFY_CLIENT_SECRET</code>, <code>SHOPIFY_WEBHOOK_SECRET</code>
          </div>
        </div>

        {/* Webhooks Info */}
        <div className="card settings-section">
          <h3>🔗 Webhooks Shopify</h3>
          <p className="muted">Les webhooks suivants sont enregistrés automatiquement au démarrage :</p>
          <table className="data-table">
            <thead>
              <tr><th>Événement</th><th>Action locale</th></tr>
            </thead>
            <tbody>
              <tr><td><code>orders/paid</code></td><td>Décrémente le stock local</td></tr>
              <tr><td><code>orders/cancelled</code></td><td>Restaure le stock local</td></tr>
              <tr><td><code>inventory_levels/update</code></td><td>Synchronise le stock local</td></tr>
              <tr><td><code>products/update</code></td><td>Synchronise les données produit</td></tr>
            </tbody>
          </table>
          <div className="settings-hint">
            Endpoint webhook: <code>/api/webhooks/shopify</code><br />
            Toutes les requêtes reçoivent un HTTP 200 immédiat.<br />
            La signature HMAC est vérifiée si <code>SHOPIFY_WEBHOOK_SECRET</code> est configuré.
          </div>
        </div>
      </div>

      <div className="settings-save-bar">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Sauvegarde..." : saved ? "✓ Sauvegardé !" : "💾 Sauvegarder les paramètres"}
        </button>
        {saved && <span className="save-success">✓ Paramètres sauvegardés avec succès</span>}
      </div>
    </div>
  );
}
