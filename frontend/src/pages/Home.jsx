import { FiArrowRight, FiPackage, FiGrid, FiPlus } from "react-icons/fi";
import { Link } from "react-router-dom";

const Home = () => {
  return (
    <div className="container-fluid p-0 d-flex flex-column flex-grow-1">
      <div className="mb-4 flex-shrink-0">
        <h1 className="h4 fw-bold text-dark mb-1">Overview & Quick Access</h1>
        <p className="text-secondary small mb-0">
          Welcome to the Point of Sale & Stock Management system.
        </p>
      </div>

      <div className="row g-3 flex-grow-1">
        <div className="col-12 col-md-4">
          <div className="card h-100 border shadow-sm rounded-3">
            <div className="card-body p-4 d-flex flex-column justify-content-between">
              <div>
                <div className="d-inline-flex p-2 rounded-2 bg-dark text-white mb-3">
                  <FiGrid size={20} />
                </div>
                <h5 className="card-title fw-semibold text-dark">Dashboard</h5>
                <p className="card-text text-secondary small">
                  Monitor live inventory metrics, sales performance, and low-stock alerts.
                </p>
              </div>
              <Link to="/dashboard" className="btn btn-dark btn-sm d-inline-flex align-items-center gap-2 align-self-start mt-3">
                Open Dashboard <FiArrowRight size={14} />
              </Link>
         
            </div>
          </div>
        </div>

        <div className="col-12 col-md-4">
          <div className="card h-100 border shadow-sm rounded-3">
            <div className="card-body p-4 d-flex flex-column justify-content-between">
              <div>
                <div className="d-inline-flex p-2 rounded-2 bg-dark text-white mb-3">
                  <FiPlus size={20} />
                </div>
                <h5 className="card-title fw-semibold text-dark">Add Stock</h5>
                <p className="card-text text-secondary small">
                  Register new inventory items, set batches, categories, and purchase prices.
                </p>
              </div>
              <Link to="/add-stock" className="btn btn-dark btn-sm d-inline-flex align-items-center gap-2 align-self-start mt-3">
                Add New Items <FiArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-4">
          <div className="card h-100 border shadow-sm rounded-3">
            <div className="card-body p-4 d-flex flex-column justify-content-between">
              <div>
                <div className="d-inline-flex p-2 rounded-2 bg-dark text-white mb-3">
                  <FiPackage size={20} />
                </div>
                <h5 className="card-title fw-semibold text-dark">View Stock</h5>
                <p className="card-text text-secondary small">
                  Search, filter, edit, and audit the full catalog of in-store products.
                </p>
              </div>
              <Link to="/view-stock" className="btn btn-dark btn-sm d-inline-flex align-items-center gap-2 align-self-start mt-3">
                Manage Catalog <FiArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
