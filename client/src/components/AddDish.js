return (
  <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-100 to-purple-200 px-4">
    
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-bold text-indigo-700 text-center mb-2">
        🍽️ Add New Dish
      </h2>
      <p className="text-gray-500 text-center mb-6 text-sm">
        Add items to your menu
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dish Name
          </label>
          <input
            type="text"
            name="name"
            value={dish.name}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2
                       focus:ring-2 focus:ring-indigo-400 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            name="category"
            value={dish.category}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2
                       focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
          >
            <option value="">Select category</option>
            <option>Starters</option>
            <option>Main Course</option>
            <option>Desserts</option>
            <option>Beverages</option>
            <option>Snacks</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Price (₹)
          </label>
          <input
            type="number"
            name="price"
            value={dish.price}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2
                       focus:ring-2 focus:ring-indigo-400 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white
                     font-semibold py-2 rounded-lg transition disabled:opacity-60"
        >
          {loading ? "Adding..." : "Add Dish 🍛"}
        </button>
      </form>

      {successMsg && (
        <div className="mt-4 text-center text-green-700 bg-green-100
                        border border-green-300 rounded-lg py-2 text-sm">
          {successMsg}
        </div>
      )}
    </div>
  </div>
);
