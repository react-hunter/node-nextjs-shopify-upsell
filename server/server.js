import "@babel/polyfill";
import dotenv from "dotenv";
import "isomorphic-fetch";
import createShopifyAuth, { verifyRequest } from "@shopify/koa-shopify-auth";
import graphQLProxy, { ApiVersion } from "@shopify/koa-shopify-graphql-proxy";
import Koa from "koa";
import cors from "koa2-cors";
import bodyParser from "koa-bodyparser";
import next from "next";
import Router from "koa-router";
import session from "koa-session";
import * as handlers from "./handlers/index";

const { Client } = require("pg");
const sgMail = require("@sendgrid/mail");

const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });

dotenv.config();
const port = parseInt(process.env.PORT, 10) || 8081;
const dev = process.env.NODE_ENV !== "production";
const app = next({
  dev,
});
const handle = app.getRequestHandler();
const {
  SHOPIFY_API_SECRET,
  SHOPIFY_API_KEY,
  SCOPES,
  DATABASE_URL,
} = process.env;
app.prepare().then(async () => {
  const server = new Koa();
  const router = new Router();
  const client = new Client({
    connectionString: DATABASE_URL,
  });
  await client.connect();

  server.use(
    session(
      {
        sameSite: "none",
        secure: true,
      },
      server
    )
  );
  server.keys = [SHOPIFY_API_SECRET];
  server.use(
    createShopifyAuth({
      apiKey: SHOPIFY_API_KEY,
      secret: SHOPIFY_API_SECRET,
      accessMode: "offline",
      scopes: [SCOPES],

      async afterAuth(ctx) {
        //Auth token and shop available in session
        //Redirect to shop upon auth
        const { shop, accessToken } = ctx.session;
        console.log("accessToken: ", accessToken);
        ctx.cookies.set("shopOrigin", shop, {
          httpOnly: false,
          secure: true,
          sameSite: "none",
        });
        // client.query('SELECT NOW()', (err, res) => {
        //   console.log(err, res)
        // });
        console.log("ctx.session: ", ctx.session);
        ctx.redirect("/");
      },
    })
  );
  server.use(
    graphQLProxy({
      version: ApiVersion.April20,
    })
  );

  server.use(bodyParser());

  // Create/update the shop metafield
  router.post("/updateSettingsMetafield", async (ctx) => {
    console.log("ctx.request.body", ctx.request.body);
    // Return message if no metafield value provided
    if (!ctx.request.body.metafieldValue) {
      ctx.body = "No metafield value provided.";
    }

    const updateMetafield = await fetch(
      `https://${ctx.session.shop}/admin/api/2020-04/metafields.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ctx.session.accessToken,
        },
        body: JSON.stringify({
          metafield: {
            namespace: "tipquik",
            key: "settings",
            value: ctx.request.body.metafieldValue,
            value_type: "json_string",
          },
        }),
      }
    );

    const updateMetafieldJson = await updateMetafield.json();
    console.log(
      "Shopify updateMetafield response:",
      JSON.stringify(updateMetafieldJson)
    );

    ctx.body = updateMetafieldJson;
  });

  // Create/update the theme snippet
  router.post("/createSnippet", async (ctx) => {
    console.log("ctx.request.body", ctx.request.body);

    // Get published theme
    const getThemes = await fetch(
      `https://${ctx.session.shop}/admin/api/2020-04/themes.json`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ctx.session.accessToken,
        },
      }
    );

    const getThemesJson = await getThemes.json();
    console.log("Shopify getThemes response:", JSON.stringify(getThemesJson));

    const publishedTheme = getThemesJson.themes.find(
      (theme) => theme.role == "main"
    );
    const publishedThemeId = publishedTheme.id;

    // Return message if no snippet value provided
    if (!ctx.request.body.asset) {
      ctx.body = "No asset value or themeId provided.";
    }

    const createSnippet = await fetch(
      `https://${ctx.session.shop}/admin/api/2020-04/themes/${publishedThemeId}/assets.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ctx.session.accessToken,
        },
        body: JSON.stringify({
          asset: ctx.request.body.asset,
        }),
      }
    );

    const createSnippetJson = await createSnippet.json();
    console.log(
      "Shopify createSnippet response:",
      JSON.stringify(createSnippetJson)
    );

    ctx.body = getThemesJson;
  });

  // Create the product
  router.post("/createProduct", async (ctx) => {
    console.log("ctx.request.body", ctx.request.body);
    // Return message if no product value provided
    if (!ctx.request.body.product) {
      ctx.body = "No product value provided.";
    }

    const createProduct = await fetch(
      `https://${ctx.session.shop}/admin/api/2020-04/products.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ctx.session.accessToken,
        },
        body: JSON.stringify({
          product: ctx.request.body.product,
        }),
      }
    );

    const createProductJson = await createProduct.json();
    console.log(
      "Shopify createProduct response:",
      JSON.stringify(createProductJson)
    );

    ctx.body = createProductJson;
  });

  router.post("/requestHelp", async (ctx) => {
    const helpRequest = ctx.request.body;
    // Send help request mail to support email (support@aesymmetric.xyz)
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const msg = {
      to: process.env.SUPPORT_EMAIL,
      from: helpRequest.store_owner,
      subject: "Need Help",
      text: "I need help from you. Store domain is " + helpRequest.store_domain,
      html:
        '<strong>I need help from you. Store domain is</strong> <a href="' +
        helpRequest.store_domain +
        '">' +
        helpRequest.store_domain +
        "</a>",
    };

    sgMail.send(msg);

    // Change installation_help_status in shop table (psql)
    client.query(
      'UPDATE shops SET installation_help_status=true WHERE shop_domain="' +
        helpRequest.store_domain +
        '"',
      (err, res) => {
        console.log(err, res);
        if (err) {
          console.log("error: ", err);
        } else {
          console.log(helpRequest.store_domain + " requested to support self.");
        }
      }
    );
  });

  router.get("*", verifyRequest(), async (ctx) => {
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
    ctx.res.statusCode = 200;
  });
  server.use(router.allowedMethods());
  server.use(router.routes());
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
