import { useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { TrendingUp, Truck, Bell, Plus, Filter } from 'lucide-react'
import './MarketPlace.css'

const listings = [
  { id: '#TR-8921', crop: 'Premium Basmati', qty: 45, bid: '₹1,240/T', bidRaw: 1240, status: 'Negotiating', farmer: 'Gurpreet Singh, Amritsar', location: 'Punjab' },
  { id: '#TR-774Z', crop: 'Winter Wheat (GW-322)', qty: 120, bid: '₹890/T', bidRaw: 890, status: 'Awaiting Pickup', farmer: 'Ramesh Yadav, Agra', location: 'U.P.' },
  { id: '#TR-9983', crop: 'Organic Soybean', qty: 30, bid: '₹1,560/T', bidRaw: 1560, status: 'Listing Live', farmer: 'Suhas Patil, Nagpur', location: 'Maharashtra' },
  { id: '#TR-6621', crop: 'Cotton (Bt-Hybrid)', qty: 55, bid: '₹2,100/T', bidRaw: 2100, status: 'Negotiating', farmer: 'Mahesh Patel, Ahmedabad', location: 'Gujarat' },
  { id: '#TR-4412', crop: 'Mustard (Bold)', qty: 80, bid: '₹650/T', bidRaw: 650, status: 'Listing Live', farmer: 'Hari Ram, Alwar', location: 'Rajasthan' },
]

const transporters = [
  { id: 'V-Logistics #442', cap: '50T', dist: '8.2km', eta: '45 min', price: '₹2.40/km', rating: 4.8 },
  { id: 'SwiftAgro Fleet B', cap: '200T', dist: '24km', eta: '2h 10m', price: '₹1.95/km', rating: 4.6 },
  { id: 'KisanTransport #17', cap: '30T', dist: '3.5km', eta: '25 min', price: '₹2.80/km', rating: 4.9 },
]

const buyerMarkers = [
  { lat: 28.6139, lng: 77.2090, label: 'Delhi Mandi Hub', type: 'buyer', buyers: 12, color: '#22c55e' },
  { lat: 19.0760, lng: 72.8777, label: 'Mumbai Market', type: 'buyer', buyers: 8, color: '#22c55e' },
  { lat: 13.0827, lng: 80.2707, label: 'Chennai Wholesale', type: 'buyer', buyers: 6, color: '#22c55e' },
  { lat: 22.5726, lng: 88.3639, label: 'Kolkata Port Market', type: 'logistic', buyers: 4, color: '#f97316' },
  { lat: 23.0225, lng: 72.5714, label: 'Ahmedabad Hub', type: 'logistic', buyers: 5, color: '#f97316' },
  { lat: 30.9010, lng: 75.8573, label: 'Ludhiana Farm', type: 'farm', buyers: 0, color: '#3b82f6' },
  { lat: 26.8467, lng: 80.9462, label: 'Lucknow Mandi', type: 'buyer', buyers: 7, color: '#22c55e' },
]

const priceData = [
  { month: 'Sep', price: 1230 }, { month: 'Oct', price: 1310 }, { month: 'Nov', price: 1280 },
  { month: 'Dec', price: 1340 }, { month: 'Jan', price: 1360 }, { month: 'Feb', price: 1388 },
]

const maxP = Math.max(...priceData.map(d => d.price))

export default function MarketPlace() {
  const [activeTab, setActiveTab] = useState('listings')
  const [selectedCrop] = useState('Basmati')

  return (
    <div className="market-page fade-in">
      <div className="market-header">
        <div>
          <h1 className="dash-title">📊 Market Connectivity & Logistics Portal</h1>
          <p className="dash-sub">Live GIS stream • North Sector • 24 Active Buyers • 12 Logisticians</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="badge badge-green pulse"><span className="dot dot-green"></span> Live GIS Stream</div>
          <button className="btn-primary" style={{ fontSize: 12 }}><Plus size={14} /> New Listing</button>
        </div>
      </div>

      <div className="market-main">
        {/* Left Nav */}
        <div className="market-nav-col">
          <div className="card">
            <div className="card-section-title">Market Hub</div>
            <div className="market-nav-links">
              {[
                { key: 'listings', icon: '📋', label: 'Active Listings' },
                { key: 'prices', icon: '📈', label: 'Price Trends' },
                { key: 'buyers', icon: '👥', label: 'Buyer Requests' },
                { key: 'transport', icon: '🚛', label: 'Transport Hub' },
              ].map(n => (
                <div key={n.key} className={`market-nav-item ${activeTab === n.key ? 'active' : ''}`} onClick={() => setActiveTab(n.key)}>
                  <span>{n.icon}</span> {n.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Map */}
        <div className="market-center-col">
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div className="market-map-header">
              <div className="market-map-title">Regional Demand Hubs – Pan India</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="badge badge-green">🟢 {buyerMarkers.filter(b => b.type === 'buyer').length * 3} Active Buyers</div>
                <div className="badge badge-orange">🟠 {buyerMarkers.filter(b => b.type === 'logistic').length * 4} Logisticians</div>
              </div>
            </div>
            <MapContainer center={[22.5, 78.9]} zoom={5} style={{ height: 280 }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" opacity={0.85} />
              {buyerMarkers.map((m, i) => (
                <CircleMarker key={i} center={[m.lat, m.lng]} radius={m.type === 'farm' ? 12 : 9}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: m.color, fillOpacity: 0.9 }}>
                  <Popup>
                    <div style={{ fontFamily: 'Inter', fontSize: 12 }}>
                      <strong>{m.label}</strong><br />Type: {m.type}<br />{m.buyers > 0 && `Active Buyers: ${m.buyers}`}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          {/* Listings */}
          {activeTab === 'listings' && (
            <div className="card">
              <div className="listings-header">
                <div className="card-section-title" style={{ margin: 0 }}>Active Listings</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" style={{ fontSize: 11 }}><Filter size={12} /> Filter</button>
                  <button className="btn-ghost" style={{ fontSize: 11 }}>View History →</button>
                </div>
              </div>
              <div className="listings-table">
                <div className="listings-thead">
                  <span>Batch ID / Crop</span><span>Qty (Tons)</span><span>Highest Bid</span><span>Farmer</span><span>Status</span>
                </div>
                {listings.map((l, i) => (
                  <div key={i} className="listings-row">
                    <span><div className="listing-id">{l.id}</div><div className="listing-crop">{l.crop}</div></span>
                    <span className="listing-qty">{l.qty}T</span>
                    <span className="listing-bid">{l.bid}</span>
                    <span className="listing-farmer"><div>{l.farmer}</div><div className="text-muted text-xs">{l.location}</div></span>
                    <span>
                      <div className={`badge ${l.status === 'Negotiating' ? 'badge-blue' : l.status === 'Awaiting Pickup' ? 'badge-orange' : 'badge-green'}`} style={{ fontSize: 10 }}>
                        {l.status}
                      </div>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'prices' && (
            <div className="card">
              <div className="card-section-title">Price Trend – {selectedCrop} (₹/Ton)</div>
              <div className="price-chart">
                {priceData.map((d, i) => (
                  <div key={i} className="chart-bar-col">
                    <div className="chart-value">₹{d.price}</div>
                    <div className="chart-bar" style={{ height: `${(d.price / maxP) * 120}px`, background: i === priceData.length - 1 ? 'var(--green-accent)' : 'var(--green-primary)' }}></div>
                    <div className="chart-label">{d.month}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(activeTab === 'buyers' || activeTab === 'transport') && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              {activeTab === 'buyers' ? '👥 24 Active Buyer Requests – Filter by crop & region' : '🚛 12 Available Transporters nearby'}
            </div>
          )}
        </div>

        {/* Right: AI Price + Transport */}
        <div className="market-right-col">
          <div className="card">
            <div className="card-section-title"><TrendingUp size={13} /> AI Price Forecasting</div>
            <div className="price-forecast-crop">BASMATI / TON</div>
            <div className="price-forecast-val">₹1,388.00</div>
            <div className="price-forecast-change">📈 +12% – 10-day forecast</div>
            <div className="price-forecast-insight">
              <strong>AI Insight:</strong> Prices expected to rise 12% in 10 days due to regional shortages and localized rainfall predictions impacting supply lines.
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-section-title"><Truck size={13} /> Book Transport</div>
            <div className="transport-list">
              {transporters.map((t, i) => (
                <div key={i} className="transport-card">
                  <div className="transport-info">
                    <div className="transport-name">{t.id}</div>
                    <div className="transport-meta">Capacity: {t.cap} | 📍 {t.dist} away</div>
                    <div className="transport-eta">ETA: {t.eta}</div>
                  </div>
                  <div className="transport-right">
                    <div className="transport-price">{t.price}</div>
                    <button className="btn-primary" style={{ fontSize: 11, padding: '6px 14px' }}>SELECT</button>
                  </div>
                </div>
              ))}
              <button className="btn-outline" style={{ width: '100%', marginTop: 8, fontSize: 12, justifyContent: 'center' }}>View All Nearby Trucks →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
