/**
 * Site Content - editable landing/blog content
 */
import mongoose from 'mongoose';

const siteContentSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'site', unique: true },
    landing: {
      heroTitle: { type: String, default: '' },
      heroDescription: { type: String, default: '' },
      ctaPrimary: { type: String, default: '' },
      ctaSecondary: { type: String, default: '' },
      communitySubtitle: { type: String, default: '' },
    },
    blog: {
      posts: {
        type: [
          {
            title: { type: String, default: '' },
            date: { type: String, default: '' },
            summary: { type: String, default: '' }
          }
        ],
        default: []
      }
    },
    terms: {
      effectiveDate: { type: String, default: '' },
      lastUpdated: { type: String, default: '' },
      jurisdiction: { type: String, default: '' },
      sections: {
        type: [
          {
            title: { type: String, default: '' },
            body: { type: String, default: '' },
            bullets: { type: [String], default: [] }
          }
        ],
        default: []
      }
    },
    learn: {
      freeResources: {
        type: [
          {
            title: { type: String, default: '' },
            description: { type: String, default: '' },
            url: { type: String, default: '' },
            type: { type: String, default: 'link' },
          }
        ],
        default: []
      },
      freeResourcesMessage: { type: String, default: 'We do not have free resources yet.' },
      bootcampMeetingUrl: { type: String, default: '' },
      bootcampMeetingMessage: { type: String, default: '' },
      bootcampMeetingUpdatedAt: { type: Date, default: null },
    },
    team: {
      hero: {
        kicker: { type: String, default: '' },
        title: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        button: { type: String, default: '' },
        route: { type: String, default: '' },
      },
      leadership: {
        title: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        members: {
          type: [
            {
              name: { type: String, default: '' },
              role: { type: String, default: '' },
              focus: { type: String, default: '' },
              icon: { type: String, default: '' },
              image: { type: String, default: '' },
              socials: {
                type: [
                  {
                    platform: { type: String, default: '' },
                    url: { type: String, default: '' },
                  }
                ],
                default: []
              },
            }
          ],
          default: []
        }
      },
      groups: {
        title: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        items: {
          type: [
            {
              title: { type: String, default: '' },
              description: { type: String, default: '' },
              icon: { type: String, default: '' },
            }
          ],
          default: []
        }
      },
      cta: {
        title: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        button: { type: String, default: '' },
        route: { type: String, default: '' },
      },
    },
  },
  { timestamps: true }
);

const SiteContent = mongoose.model('SiteContent', siteContentSchema);
export default SiteContent;
