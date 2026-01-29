import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import BackgroundText from "../components/BackgroundText";
import useBodyClass from "../lib/useBodyClass";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabase";

const BUCKET = "product-images";

export default function Admin() {
  useBodyClass("body-georama body-admin");

  useEffect(() => {
    document.title = "Admin";
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

    let slugManuallyEdited = false;
    let supportsDeliveryFields = true;
    let supportsVariantFields = true;

    let pendingDeleteId: string | null = null;
    let pendingDeleteTitle = "";
    let lastFocusEl: Element | null = null;

    const setStatus = (msg: string, kind = "") => {
      const s = $("status");
      if (!s) return;
      s.textContent = msg || "";
      s.className = "statusline" + (kind ? ` ${kind}` : "");
    };

    const slugify = (s: string) =>
      String(s || "")
        .trim()
        .toLowerCase()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const escapeHtml = (str: string) =>
      String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const money = (n: number) => {
      const v = Number(n || 0);
      return `€${Number.isFinite(v) ? v.toFixed(2) : "0.00"}`;
    };

    const setDeliverySupport = (isSupported: boolean) => {
      supportsDeliveryFields = isSupported;
      ["auto_deliver", "delivery_text", "duration_days"].forEach((id) => {
        const el = $(id) as HTMLInputElement | null;
        if (el) el.disabled = !isSupported;
      });
      const note = $("deliverySupportNote");
      if (note) {
        note.textContent = isSupported
          ? "Leave blank to auto-generate on purchase."
          : "Add columns auto_deliver, delivery_text, duration_days to enable auto delivery/time-based products.";
      }
    };

    const setVariantSupport = (isSupported: boolean) => {
      supportsVariantFields = isSupported;
      const variantSection = $("variantSection");
      if (variantSection) variantSection.style.display = isSupported ? "block" : "none";
      const note = $("variantSupportNote");
      if (note) {
        note.textContent = isSupported
          ? "Fill in price to enable a duration option."
          : "Create a product_variants table to enable duration-based pricing.";
      }
    };

    const refreshUI = async () => {
      const { data } = await sb.auth.getSession();
      const session = data.session;
      if (!session) {
        const authCard = $("authCard");
        const app = $("app");
        const me = $("me");
        const logoutBtn = $("logoutBtn");
        if (authCard) authCard.style.display = "block";
        if (app) app.style.display = "none";
        if (me) me.textContent = "not logged in";
        if (logoutBtn) logoutBtn.style.display = "none";
        return;
      }

      const authCard = $("authCard");
      const app = $("app");
      const me = $("me");
      const logoutBtn = $("logoutBtn");
      if (authCard) authCard.style.display = "none";
      if (app) app.style.display = "block";
      if (me) me.textContent = session.user.email;
      if (logoutBtn) logoutBtn.style.display = "inline-flex";

      await loadProducts();
    };

    const signIn = async () => {
      setStatus("Signing in…");
      const email = (document.getElementById("email") as HTMLInputElement | null)?.value.trim() || "";
      const password = (document.getElementById("pass") as HTMLInputElement | null)?.value || "";
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return setStatus(`Login error: ${error.message}`, "error");
      setStatus("Logged in ✅", "ok");
      await refreshUI();
    };

    const signOut = async () => {
      await sb.auth.signOut();
      setStatus("Logged out.");
      await refreshUI();
    };

    const loadProducts = async () => {
      setStatus("Loading products…");
      let data: any = null;
      let error: any = null;

      ({ data, error } = await sb
        .from("products")
        .select("id,title,slug,price_eur,description,image_url,is_active,created_at,auto_deliver,delivery_text,duration_days")
        .order("created_at", { ascending: false }));

      if (error && String(error.message || "").includes("column")) {
        setDeliverySupport(false);
        ({ data, error } = await sb
          .from("products")
          .select("id,title,slug,price_eur,description,image_url,is_active,created_at")
          .order("created_at", { ascending: false }));
      } else {
        setDeliverySupport(true);
      }

      setVariantSupport(true);

      if (error) {
        setStatus(`Load error: ${error.message} (If RLS denied: add your user to public.admins.)`, "error");
        const body = $("tableBody");
        if (body) body.innerHTML = "";
        return;
      }

      const body = $("tableBody");
      if (!body) return;

      body.innerHTML = (data || [])
        .map((p: any) => {
          const activeTag = p.is_active ? '<span class="tag on">active</span>' : '<span class="tag off">inactive</span>';
          const deliveryTag = p.auto_deliver ? '<span class="tag on">auto-delivery</span>' : '<span class="tag off">manual</span>';
          const durationTag = p.duration_days
            ? `<span class="tag on">${Number(p.duration_days)}d</span>`
            : '<span class="tag off">no duration</span>';
          const thumb = p.image_url
            ? `<div class="thumb"><img src="${p.image_url}" alt=""></div>`
            : '<div class="thumb"><span class="muted">—</span></div>';
          return `
        <tr>
          <td>
            <div style="font-weight:bold">
              ${p.slug
                ? `<a class="product-link" href="/rosina-shop/product/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">${escapeHtml(p.title || "")}</a>`
                : `${escapeHtml(p.title || "")}`}
            </div>
            <div class="muted">
              ${p.slug
                ? `<a class="product-link" href="/rosina-shop/product/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">${escapeHtml(p.slug || "")}</a>`
                : `${escapeHtml(p.slug || "")}`}
            </div>
            <div class="small" style="margin-top:6px">${escapeHtml((p.description || "").slice(0, 90))}${(p.description || "").length > 90 ? "…" : ""}</div>
            <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
              ${supportsDeliveryFields ? deliveryTag : ""}
              ${supportsDeliveryFields ? durationTag : ""}
            </div>
          </td>
          <td>${money(p.price_eur)}</td>
          <td>${activeTag}</td>
          <td>${thumb}</td>
          <td>
            <div class="actions-cell">
              <button data-edit="${p.id}">Edit</button>
              <button class="danger" data-del="${p.id}" data-title="${escapeHtml(p.title || "")}">Delete</button>
            </div>
          </td>
        </tr>
      `;
        })
        .join("");

      document.querySelectorAll("[data-edit]").forEach((b) => {
        (b as HTMLButtonElement).onclick = () => editProduct((b as HTMLButtonElement).dataset.edit || "");
      });
      document.querySelectorAll("[data-del]").forEach((b) => {
        const button = b as HTMLButtonElement;
        button.onclick = () => openDeleteModal(button.dataset.del || "", button.dataset.title || "");
      });

      setStatus("");
    };

    const editProduct = async (id: string) => {
      setStatus("Loading product…");
      let data: any = null;
      let error: any = null;

      ({ data, error } = await sb
        .from("products")
        .select("id,title,slug,price_eur,description,image_url,is_active,auto_deliver,delivery_text,duration_days")
        .eq("id", id)
        .maybeSingle());

      if (error && String(error.message || "").includes("column")) {
        setDeliverySupport(false);
        ({ data, error } = await sb
          .from("products")
          .select("id,title,slug,price_eur,description,image_url,is_active")
          .eq("id", id)
          .maybeSingle());
      } else {
        setDeliverySupport(true);
      }

      if (error || !data) {
        return setStatus(`Edit load error: ${error?.message || "Not found"}`, "error");
      }

      (document.getElementById("id") as HTMLInputElement | null)!.value = data.id;
      (document.getElementById("title") as HTMLInputElement | null)!.value = data.title || "";
      (document.getElementById("slug") as HTMLInputElement | null)!.value = data.slug || "";
      (document.getElementById("price_eur") as HTMLInputElement | null)!.value = data.price_eur ?? "";
      (document.getElementById("is_active") as HTMLSelectElement | null)!.value = String(!!data.is_active);
      (document.getElementById("description") as HTMLTextAreaElement | null)!.value = data.description || "";
      (document.getElementById("image_url") as HTMLInputElement | null)!.value = data.image_url || "";
      (document.getElementById("image_file") as HTMLInputElement | null)!.value = "";
      (document.getElementById("auto_deliver") as HTMLInputElement | null)!.checked = Boolean(data.auto_deliver);
      (document.getElementById("delivery_text") as HTMLInputElement | null)!.value = data.delivery_text || "";
      (document.getElementById("duration_days") as HTMLSelectElement | null)!.value = data.duration_days
        ? String(data.duration_days)
        : "";

      await loadVariants(id);

      const auto = slugify(data.title || "");
      const existing = (data.slug || "").trim();
      slugManuallyEdited = !!existing && existing !== auto;

      renderPreview(data.image_url || "");
      setStatus(`Editing: ${data.title || data.id}`, "ok");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const clearForm = () => {
      (document.getElementById("id") as HTMLInputElement | null)!.value = "";
      (document.getElementById("title") as HTMLInputElement | null)!.value = "";
      (document.getElementById("slug") as HTMLInputElement | null)!.value = "";
      (document.getElementById("price_eur") as HTMLInputElement | null)!.value = "";
      (document.getElementById("is_active") as HTMLSelectElement | null)!.value = "true";
      (document.getElementById("description") as HTMLTextAreaElement | null)!.value = "";
      (document.getElementById("image_url") as HTMLInputElement | null)!.value = "";
      (document.getElementById("image_file") as HTMLInputElement | null)!.value = "";
      (document.getElementById("auto_deliver") as HTMLInputElement | null)!.checked = false;
      (document.getElementById("delivery_text") as HTMLInputElement | null)!.value = "";
      (document.getElementById("duration_days") as HTMLSelectElement | null)!.value = "";
      clearVariantsForm();
      renderPreview("");
      slugManuallyEdited = false;
      setStatus("");
    };

    const renderPreview = (url: string) => {
      const u = (url || "").trim();
      const preview = $("preview");
      if (!preview) return;
      preview.innerHTML = u ? `<img src="${u}" alt="preview">` : '<span class="muted">no image</span>';
    };

    const openDeleteModal = (id: string, title = "") => {
      if (!id) return;
      lastFocusEl = document.activeElement;
      pendingDeleteId = id;
      pendingDeleteTitle = title || "";
      const label = $("deleteTarget");
      if (label) label.textContent = pendingDeleteTitle ? `“${pendingDeleteTitle}”` : "this product";
      const overlay = $("deleteOverlay");
      if (!overlay) return;
      overlay.style.display = "flex";
      overlay.setAttribute("aria-hidden", "false");
      (overlay as any).inert = false;
      const cancel = document.getElementById("deleteCancelBtn") as HTMLButtonElement | null;
      cancel?.focus();
    };

    const closeDeleteModal = () => {
      const overlay = $("deleteOverlay");
      if (!overlay) return;
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden", "true");
      (overlay as any).inert = true;
      pendingDeleteId = null;
      pendingDeleteTitle = "";
      if (lastFocusEl && "focus" in lastFocusEl) (lastFocusEl as HTMLElement).focus();
      lastFocusEl = null;
    };

    const confirmDeleteModal = async () => {
      if (!pendingDeleteId) return closeDeleteModal();
      const id = pendingDeleteId;
      closeDeleteModal();
      await deleteProduct(id);
    };

    const uploadImageIfAny = async () => {
      const fileInput = document.getElementById("image_file") as HTMLInputElement | null;
      const file = fileInput?.files?.[0];
      if (!file) return null;

      setStatus("Uploading image…");

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const name = `${crypto.randomUUID()}.${ext}`;
      const path = `products/${name}`;

      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type,
      });

      if (upErr) throw upErr;

      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
      return pub?.publicUrl || null;
    };

    const saveProduct = async (event: Event) => {
      event.preventDefault();

      const id = (document.getElementById("id") as HTMLInputElement | null)?.value.trim() || null;
      const title = (document.getElementById("title") as HTMLInputElement | null)?.value.trim() || "";
      const currentSlug = (document.getElementById("slug") as HTMLInputElement | null)?.value.trim() || "";
      const slug = slugManuallyEdited ? currentSlug : currentSlug || slugify(title);
      const price_eur = Number((document.getElementById("price_eur") as HTMLInputElement | null)?.value || 0);
      const is_active = (document.getElementById("is_active") as HTMLSelectElement | null)?.value === "true";
      const description = (document.getElementById("description") as HTMLTextAreaElement | null)?.value || "";
      const auto_deliver = Boolean((document.getElementById("auto_deliver") as HTMLInputElement | null)?.checked);
      const delivery_text = (document.getElementById("delivery_text") as HTMLInputElement | null)?.value || "";
      const duration_days_raw = (document.getElementById("duration_days") as HTMLSelectElement | null)?.value || "";
      const duration_days = duration_days_raw ? Number(duration_days_raw) : null;

      if (!title) return setStatus("Title is required.", "error");
      if (!slug) return setStatus("Slug is required.", "error");

      try {
        const uploadedUrl = await uploadImageIfAny();
        const image_url =
          uploadedUrl || (document.getElementById("image_url") as HTMLInputElement | null)?.value.trim() || null;

        const payload: any = {
          title,
          slug,
          price_eur,
          is_active,
          description,
          image_url,
          ...(supportsDeliveryFields ? { auto_deliver, delivery_text, duration_days } : {}),
        };

        setStatus("Saving…");

        let error: any = null;
        let savedId = id;
        if (id) {
          ({ error } = await sb.from("products").update(payload).eq("id", id));
        } else {
          const { data: inserted, error: insertError } = await sb
            .from("products")
            .insert(payload)
            .select("id")
            .maybeSingle();
          error = insertError;
          savedId = inserted?.id || null;
        }

        if (error && String(error.message || "").includes("column") && supportsDeliveryFields) {
          setDeliverySupport(false);
          const fallbackPayload = {
            title,
            slug,
            price_eur,
            is_active,
            description,
            image_url,
          };
          if (id) {
            ({ error } = await sb.from("products").update(fallbackPayload).eq("id", id));
          } else {
            ({ error } = await sb.from("products").insert(fallbackPayload));
          }
        }

        if (error) return setStatus(`Save error: ${error.message}`, "error");

        if (supportsVariantFields && savedId) {
          const variantError = await saveVariants(savedId);
          if (variantError) return setStatus(`Variant save error: ${variantError}`, "error");
        }

        setStatus("Saved ✅", "ok");
        clearForm();
        await loadProducts();
      } catch (err: any) {
        setStatus(`Upload error: ${err?.message || String(err)}`, "error");
      }
    };

    const deleteProduct = async (id: string) => {
      setStatus("Deleting…");
      const { error } = await sb.from("products").delete().eq("id", id);
      if (error) return setStatus(`Delete error: ${error.message}`, "error");
      setStatus("Deleted ✅", "ok");
      await loadProducts();
    };

    const variantDurations = () => [1, 3, 7, 30];

    const clearVariantsForm = () => {
      variantDurations().forEach((days) => {
        const priceEl = document.getElementById(`variant_price_${days}`) as HTMLInputElement | null;
        const keyEl = document.getElementById(`variant_key_${days}`) as HTMLInputElement | null;
        const autoEl = document.getElementById(`variant_auto_${days}`) as HTMLInputElement | null;
        if (priceEl) priceEl.value = "";
        if (keyEl) keyEl.value = "";
        if (autoEl) autoEl.checked = false;
      });
    };

    const loadVariants = async (productId: string) => {
      if (!productId) return clearVariantsForm();
      let data: any = null;
      let error: any = null;

      ({ data, error } = await sb
        .from("product_variants")
        .select("id,product_id,duration_days,price_eur,auto_deliver,delivery_text")
        .eq("product_id", productId));

      if (error && String(error.message || "").includes("relation")) {
        setVariantSupport(false);
        clearVariantsForm();
        return;
      }

      setVariantSupport(true);
      clearVariantsForm();

      (data || []).forEach((variant: any) => {
        const days = Number(variant.duration_days);
        const priceEl = document.getElementById(`variant_price_${days}`) as HTMLInputElement | null;
        const keyEl = document.getElementById(`variant_key_${days}`) as HTMLInputElement | null;
        const autoEl = document.getElementById(`variant_auto_${days}`) as HTMLInputElement | null;
        if (priceEl) priceEl.value = variant.price_eur ?? "";
        if (keyEl) keyEl.value = variant.delivery_text || "";
        if (autoEl) autoEl.checked = Boolean(variant.auto_deliver);
      });
    };

    const saveVariants = async (productId: string) => {
      let errorMessage: string | null = null;
      const variants = variantDurations()
        .map((days) => {
          const priceEl = document.getElementById(`variant_price_${days}`) as HTMLInputElement | null;
          const keyEl = document.getElementById(`variant_key_${days}`) as HTMLInputElement | null;
          const autoEl = document.getElementById(`variant_auto_${days}`) as HTMLInputElement | null;
          const price = priceEl ? Number(priceEl.value || 0) : 0;
          const hasPrice = priceEl && priceEl.value !== "";
          if (!hasPrice) return null;
          return {
            product_id: productId,
            duration_days: days,
            price_eur: price,
            auto_deliver: Boolean(autoEl?.checked),
            delivery_text: keyEl?.value || "",
          };
        })
        .filter(Boolean);

      if (!variants.length) {
        const { error } = await sb.from("product_variants").delete().eq("product_id", productId);
        if (error && String(error.message || "").includes("relation")) {
          setVariantSupport(false);
          return null;
        }
        if (error) {
          errorMessage = error.message;
        }
        return errorMessage;
      }

      const { error: deleteError } = await sb.from("product_variants").delete().eq("product_id", productId);
      if (deleteError && String(deleteError.message || "").includes("relation")) {
        setVariantSupport(false);
        return null;
      }
      if (deleteError) {
        return deleteError.message;
      }

      const { error: insertError } = await sb.from("product_variants").insert(variants as any);
      if (insertError && String(insertError.message || "").includes("relation")) {
        setVariantSupport(false);
        return null;
      }
      if (insertError) {
        errorMessage = insertError.message;
      }

      return errorMessage;
    };

    const initBgText = () => {
      const bgText = $("bgText");
      if (!bgText) return;
      const text = "I LOVE RADEK NEVARIL ";
      let html = "";
      const isMobile = window.innerWidth < 768;
      const rows = isMobile ? 50 : 100;
      const cols = isMobile ? 5 : 10;
      for (let i = 0; i < rows; i++) {
        let line = "";
        for (let j = 0; j < cols; j++) line += text;
        html += `<div>${line}</div>`;
      }
      bgText.innerHTML = html;
    };

    const overlay = $("deleteOverlay");
    const loginBtn = $("loginBtn");
    const logoutBtn = $("logoutBtn");
    const productForm = $("productForm") as HTMLFormElement | null;
    const clearBtn = $("clearBtn");

    initBgText();
    setDeliverySupport(true);
    setVariantSupport(true);

    if (loginBtn) loginBtn.onclick = signIn;
    if (logoutBtn) logoutBtn.onclick = signOut;
    if (productForm) productForm.onsubmit = saveProduct;
    if (clearBtn) clearBtn.onclick = clearForm;

    ["email", "pass"].forEach((id) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return;
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void signIn();
        }
      });
    });

    const deleteCancel = document.getElementById("deleteCancelBtn") as HTMLButtonElement | null;
    const deleteConfirm = document.getElementById("deleteConfirmBtn") as HTMLButtonElement | null;
    const deleteClose = document.getElementById("deleteCloseBtn") as HTMLButtonElement | null;

    deleteCancel?.addEventListener("click", closeDeleteModal);
    deleteConfirm?.addEventListener("click", () => void confirmDeleteModal());
    deleteClose?.addEventListener("click", closeDeleteModal);
    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) closeDeleteModal();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay?.style.display === "flex") closeDeleteModal();
    });

    const titleInput = document.getElementById("title") as HTMLInputElement | null;
    const slugInput = document.getElementById("slug") as HTMLInputElement | null;

    titleInput?.addEventListener("input", () => {
      if (slugManuallyEdited) return;
      if (slugInput) slugInput.value = slugify(titleInput.value);
    });

    slugInput?.addEventListener("input", () => {
      slugManuallyEdited = (slugInput?.value || "").trim().length > 0;
    });

    slugInput?.addEventListener("blur", () => {
      if (slugInput && !slugInput.value.trim()) {
        slugManuallyEdited = false;
        slugInput.value = slugify(titleInput?.value || "");
      }
    });

    const imageUrl = document.getElementById("image_url") as HTMLInputElement | null;
    const imageFile = document.getElementById("image_file") as HTMLInputElement | null;

    imageUrl?.addEventListener("input", () => renderPreview(imageUrl.value));
    imageFile?.addEventListener("change", () => {
      const file = imageFile.files?.[0];
      if (!file) return;
      const localUrl = URL.createObjectURL(file);
      renderPreview(localUrl);
    });

    clearForm();
    void refreshUI();
  }, []);

  return (
    <div className="page admin-page">
      <BackgroundText text="I LOVE RADEK NEVARIL " rows={100} cols={10} className="background-text" id="bgText" />

      <a href="/rosina-shop/" className="back-button">
        <i className="fas fa-arrow-left"></i> Back
      </a>

      <div className="container">
        <div className="topbar">
          <div>
            <div className="title">admin panel</div>
            <div className="subtitle">Sign-in required. Authorized access only.</div>
            <div id="status" className="statusline"></div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <span className="pill">user: <span id="me">…</span></span>
            <button id="logoutBtn" className="ghost">Logout</button>
          </div>
        </div>

        <div id="authCard" className="card" style={{ display: "none" }}>
          <div className="section-title">Login</div>
          <div className="login-grid">
            <div>
              <label>Email</label>
              <input id="email" type="email" placeholder="you@example.com" />
            </div>
            <div>
              <label>Password</label>
              <input id="pass" type="password" placeholder="••••••••" />
            </div>
          </div>
          <div className="row-actions">
            <button id="loginBtn" className="primary">Login</button>
          </div>
        </div>

        <div id="app" style={{ display: "none" }}>
          <div className="card">
            <div className="section-title">Create / Edit product</div>

            <form id="productForm">
              <input id="id" type="hidden" />

              <div className="grid2">
                <div>
                  <label>Title</label>
                  <input id="title" type="text" placeholder="Product title" />
                </div>
                <div>
                  <label>Slug (unique)</label>
                  <input id="slug" type="text" placeholder="auto-from-title" />
                </div>
              </div>

              <div className="grid3" style={{ marginTop: "12px" }}>
                <div>
                  <label>Price (EUR)</label>
                  <input id="price_eur" type="number" step="0.01" placeholder="0.00" />
                </div>
                <div>
                  <label>Active</label>
                  <select id="is_active">
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>
                <div>
                  <label>Image URL (optional)</label>
                  <input id="image_url" type="text" placeholder="https://…" />
                </div>
              </div>

              <div className="grid4" style={{ marginTop: "12px" }}>
                <div>
                  <label>Auto delivery</label>
                  <div className="checkbox-row">
                    <input id="auto_deliver" type="checkbox" />
                    <span className="small">Auto output license / key</span>
                  </div>
                </div>
                <div>
                  <label>Delivery text / key</label>
                  <input id="delivery_text" type="text" placeholder="e.g. LICENSE-XXXXX" />
                  <div className="muted" id="deliverySupportNote" style={{ marginTop: "6px" }}>
                    Leave blank to auto-generate on purchase.
                  </div>
                </div>
                <div>
                  <label>Duration</label>
                  <select id="duration_days">
                    <option value="">No time limit</option>
                    <option value="1">1 day</option>
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                  </select>
                  <div className="muted" style={{ marginTop: "6px" }}>Used for time-based products.</div>
                </div>
              </div>

              <div id="variantSection" style={{ marginTop: "16px" }}>
                <div className="section-title">Duration pricing (1d / 3d / 7d / 30d)</div>
                <div className="muted" id="variantSupportNote">Fill in price to enable a duration option.</div>
                <div className="variant-grid">
                  <div className="variant-row">
                    <div>
                      <div className="variant-title">1 day</div>
                      <label>Price (EUR)</label>
                      <input id="variant_price_1" type="number" step="0.01" placeholder="0.00" />
                    </div>
                    <div>
                      <label>Delivery key</label>
                      <input id="variant_key_1" type="text" placeholder="LICENSE-XXXX" />
                    </div>
                    <div>
                      <label>Auto deliver</label>
                      <div className="checkbox-row">
                        <input id="variant_auto_1" type="checkbox" />
                        <span className="small">Auto output key</span>
                      </div>
                    </div>
                  </div>
                  <div className="variant-row">
                    <div>
                      <div className="variant-title">3 days</div>
                      <label>Price (EUR)</label>
                      <input id="variant_price_3" type="number" step="0.01" placeholder="0.00" />
                    </div>
                    <div>
                      <label>Delivery key</label>
                      <input id="variant_key_3" type="text" placeholder="LICENSE-XXXX" />
                    </div>
                    <div>
                      <label>Auto deliver</label>
                      <div className="checkbox-row">
                        <input id="variant_auto_3" type="checkbox" />
                        <span className="small">Auto output key</span>
                      </div>
                    </div>
                  </div>
                  <div className="variant-row">
                    <div>
                      <div className="variant-title">7 days</div>
                      <label>Price (EUR)</label>
                      <input id="variant_price_7" type="number" step="0.01" placeholder="0.00" />
                    </div>
                    <div>
                      <label>Delivery key</label>
                      <input id="variant_key_7" type="text" placeholder="LICENSE-XXXX" />
                    </div>
                    <div>
                      <label>Auto deliver</label>
                      <div className="checkbox-row">
                        <input id="variant_auto_7" type="checkbox" />
                        <span className="small">Auto output key</span>
                      </div>
                    </div>
                  </div>
                  <div className="variant-row">
                    <div>
                      <div className="variant-title">30 days</div>
                      <label>Price (EUR)</label>
                      <input id="variant_price_30" type="number" step="0.01" placeholder="0.00" />
                    </div>
                    <div>
                      <label>Delivery key</label>
                      <input id="variant_key_30" type="text" placeholder="LICENSE-XXXX" />
                    </div>
                    <div>
                      <label>Auto deliver</label>
                      <div className="checkbox-row">
                        <input id="variant_auto_30" type="checkbox" />
                        <span className="small">Auto output key</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "12px" }}>
                <label>Description</label>
                <textarea id="description" placeholder="Describe the product…"></textarea>
              </div>

              <div className="grid2" style={{ marginTop: "12px" }}>
                <div>
                  <label>Upload image (overrides URL)</label>
                  <input id="image_file" type="file" accept="image/*" />
                  <div className="muted" style={{ marginTop: "8px" }}>
                    Uses bucket <b>product-images</b> and saves public URL into <b>image_url</b>.
                  </div>
                </div>
                <div>
                  <label>Preview</label>
                  <div id="preview" className="preview">
                    <span className="muted">no image</span>
                  </div>
                </div>
              </div>

              <div className="row-actions">
                <button className="primary" type="submit">Save</button>
                <button id="clearBtn" type="button" className="ghost">Clear</button>
                <span className="muted">Tip: leave slug empty to auto-generate from title.</span>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="section-title">All products</div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Image</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="tableBody"></tbody>
              </table>
            </div>

            <div className="muted" style={{ marginTop: "10px" }}>
              If you only see active products on the public site, that’s correct — your storefront reads
              <b>is_active=true</b>.
            </div>
          </div>
        </div>
      </div>

      <div id="deleteOverlay" className="modal-overlay" aria-hidden="true" inert>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="deleteTitle">
          <div className="modal-head">
            <div id="deleteTitle" className="modal-title">Delete product</div>
            <button id="deleteCloseBtn" className="modal-close" type="button" aria-label="Close">✕</button>
          </div>
          <div className="modal-body">
            This will permanently delete <b id="deleteTarget">this product</b> from the database.
            <div className="small" style={{ marginTop: "8px", color: "#888" }}>
              Tip: if you only want to hide it from the public site, edit it and set <b>Active=false</b>.
            </div>
          </div>
          <div className="modal-actions">
            <button id="deleteCancelBtn" className="ghost" type="button">Cancel</button>
            <button id="deleteConfirmBtn" className="danger" type="button">Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}
