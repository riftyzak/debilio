import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Rajnoha from "./pages/Rajnoha";
import Shop from "./pages/Shop";
import Product from "./pages/Product";
import Checkout from "./pages/Checkout";
import Admin from "./pages/Admin";
import Success from "./pages/Success";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/rajnoha" element={<Rajnoha />} />
      <Route path="/rosina-shop" element={<Shop />} />
      <Route path="/rosina-shop/" element={<Shop />} />
      <Route path="/rosina-shop/product/:slug" element={<Product />} />
      <Route path="/rosina-shop/checkout" element={<Checkout />} />
      <Route path="/rosina-shop/checkout.html" element={<Checkout />} />
      <Route path="/rosina-shop/admin" element={<Admin />} />
      <Route path="/rosina-shop/admin.html" element={<Admin />} />
      <Route path="/rosina-shop/success" element={<Success />} />
      <Route path="/rosina-shop/success.html" element={<Success />} />
    </Routes>
  );
}
