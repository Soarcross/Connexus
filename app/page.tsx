export default function HomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">
        Opportunities
      </h1>

      {/* Featured Section */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">
          Top Opportunity of the Month
        </h2>

        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <h3 className="font-semibold">NASA Internship</h3>
          <p className="text-sm text-gray-600">
            Apply for a summer internship program.
          </p>
        </div>
      </section>

      {/* List Section */}
      <section>
        <h2 className="text-lg font-medium mb-4">
          Club Opportunities
        </h2>

        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <h3 className="font-semibold">Robotics Club</h3>
            <p className="text-sm text-gray-600">
              Join the robotics team.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}