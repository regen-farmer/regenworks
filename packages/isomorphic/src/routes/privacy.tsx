import type { Component } from "solid-js";
import "~/styling/paper.css";
import { NavBar } from "~/components/NavBar.tsx";

const RouteViewPrivacy: Component = () => {
	return (
		<>
			<NavBar />
			<main class="paper">
				<div>
					<div class="container">
						<h1 class="h1">Regen Farmer Privacy Policy</h1>
						<p>
							<em>Last revised: October 30, 2020</em>
						</p>

						<h2 class="h2">1. PERSONAL DATA POLICY</h2>
						<p>
							In accordance with the EU General Data Protection Regulation
							(GDPR), Regen Farver ApS strives to clarify the activities
							relating to the registration, storing and use of the Customer’s
							personal data and the purpose thereof.
						</p>
						<p>
							Personal data includes any and all information related to an
							identified and identifiable natural individual. Examples of such
							information are email addresses, social security numbers, private
							contact information, civil statuses, IP addresses and portrait
							photos.
						</p>
						<p>
							Publicly available information such as company name, registration
							numbers, main telephone numbers and direct business telephone
							numbers to employees are not considered personal data.
						</p>

						<h2 class="h2">2. COLLECTION OF DATA</h2>
						<p>
							Regen Farmer ApS only collects information about the Customer
							when:
						</p>
						<ul>
							<li>
								The Customer signs up on the Regen Farmer website in connection
								with the registration of an account or by indicating interest in
								further information and contact;
							</li>
							<li>
								The Customer makes telephone or written contact to Regen Farmer
								in connection with sales and customer support as well as other
								inquiries where the Customer’s contact with Regen Farmer must be
								documented to ensure that the correct services are provided to
								the Customer;
							</li>
							<li>
								Regen Farmer receives telephone or written inquiries by the
								Customer;
							</li>
							<li>
								The Customer is invoiced for the products purchased by the
								Customer;
							</li>
							<li>
								The Customer registers new details or makes changes to the
								account details on the Customer’s subscription in the
								Application.
							</li>
						</ul>
						<p>
							In the above instances, Regen Farmer will record the following
							information about the Customer, if disclosed:
						</p>
						<ul>
							<li>Email address;</li>
							<li>Billing address;</li>
							<li>VAT/company registration numbers;</li>
							<li>
								Telephonic (though not audio recordings) and written
								correspondence between Regen Farmer and the Customer;
							</li>
							<li>
								Date, time and duration of telephone correspondence between
								Regen Farmer and the Customer;
							</li>
							<li>
								Certain data about your use of the RegenWorks Platform (IP
								address or device ID) that is considered Personal Information in
								some jurisdictions.
							</li>
						</ul>
						<p>
							In addition, Regen Farmer ApS will record the following
							information about the Customer that is specific to the Customer’s
							use of the Application, if disclosed:
						</p>
						<ul>
							<li>Geographical locations and land areas;</li>
							<li>
								Uploaded files containing geographic (GIS) information about the
								Customer’s business and land areas;
							</li>
							<li>
								Naming of land areas parcels, layers, weather stations and
								variable-rate application maps;
							</li>
							<li>Geographical locations on notes and markings;</li>
							<li>Free text content on notes;</li>
							<li>Naming and dates on tasks and activities;</li>
							<li>Naming and values on assets, yields and expenses.</li>
						</ul>

						<h2 class="h2">3. STORAGE AND PROTECTION OF DATA</h2>
						<p>
							All collected information that relates in one way or another to
							the Customer is protected by encryption and passwords in Regen
							Farmer’s own internal systems and in third party systems where
							necessary, for instance, in external bookkeeping systems and CRM.
						</p>
						<p>
							The data required for Regen Farmer’s operations and general
							business, exclusively including business information used for
							billing and contact between Regen Farmer and the Customer, will be
							available to Regen Farmer’s external accountant according to the
							need-to-know principle. For example, Regen Farmer may share the
							Customer’s company information with Regen Farmer’s affiliated
							accountant in the event of non-payment, overdue payments, and
							similar situations.
						</p>
						<p>
							If the Customer wishes to terminate his/her subscriptions in Regen
							Farmer, the above-mentioned collected data relating to the
							Customer will be stored in anonymized form. If the Customer wishes
							that this data ceases to be used by Regen Farmer in anonymized
							form, the Customer has the right, upon request, to have the
							collected personal data deleted by Regen Farmer. However, Regen
							Farmer reserves the right to continue to store and use data that
							is not considered personal, such as company information and data
							specific to the Application.
						</p>

						<h2 class="h2">4. USE OF DATA</h2>
						<p>
							As a general rule, Regen Farmer does not apply and disseminate the
							Customer’s personal data.
						</p>
						<p>
							Regen Farmer exclusively uses personal data for operations related
							to daily operations and administration, including billing,
							bookkeeping and general customer contact. Upon the signing of a
							purchase agreement between Regen Farmer and the Customer, the
							Customer must give his or her consent that Regen Farmer may
							contact the Customer in connection with the dissemination of
							system update messages, training material and marketing material.
							The Customer may opt out that Regen Farmer may make contact. The
							Customer may also withdraw his or her consent at any time.
						</p>
						<p>
							Regen Farmer uses other data specific to the Application (such as
							data from satellites and weather stations) associated with the
							Customer’s account with the intent to further develop and optimize
							the Application. This data is not considered personal data. The
							purpose of this will always be to improve the Application and the
							Customer’s experience. The data will specifically be used to
							develop new features, including artificially intelligent
							decision-support systems that use data that is not sensitive to
							the Customer’s privacy.
						</p>
						<p>
							<em>
								The Privacy Policy is version 1.1 and is valid from 30-10-2020.
							</em>
						</p>
					</div>
				</div>
			</main>
		</>
	);
};

export default RouteViewPrivacy;
